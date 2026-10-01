import nodemailer, { type NodemailerError, type Transporter } from "nodemailer"
import { BRAND } from "@/lib/brand"
import { renderAuthEmail } from "./email-templates"
import { isEmail, normalizeEmail } from "./validation"

/**
 * Envio de e-mails da Íntegra — único ponto que fala com o SMTP (Brevo). Só roda no
 * servidor: as credenciais vêm de `BREVO_SMTP_*` (nunca `NEXT_PUBLIC_`). Nenhuma
 * função daqui lança por falha de envio: devolvem um `EmailResult`, e quem chama
 * decide se a operação principal continua (convite) ou se vira erro (reenvio).
 *
 * Os e-mails nativos do Supabase Auth não passam por aqui: o próprio Supabase envia,
 * pelo SMTP da Brevo configurado no painel (README › E-mail).
 */

export type AuthLinkKind = "recovery" | "invite"

export type EmailFailure = "not_configured" | "invalid_recipient" | "rejected" | "auth" | "timeout" | "unavailable" | "unexpected"

export type EmailResult =
  | { ok: true; messageId: string; /** true = já enviado há instantes; nada saiu de novo. */ duplicate?: boolean }
  | { ok: false; reason: EmailFailure; /** Seguro para mostrar a quem usa a Íntegra. */ message: string }

export interface EmailMessage {
  to: string
  subject: string
  html: string
  /** Versão em texto. Sem ela, é derivada do HTML. */
  text?: string
  replyTo?: string
  /** Mesma chave dentro de `DEDUPE_WINDOW_MS` = um envio só (cliques repetidos, re-renders). */
  dedupeKey?: string
}

export interface MailerConfig {
  host: string
  port: number
  /** TLS direto (porta 465); nas outras portas, STARTTLS obrigatório. */
  secure: boolean
  user: string
  password: string
  from: { name: string; address: string }
}

const DEFAULT_PORT = 587
/** Conexão, saudação e inatividade do SMTP; e o teto de uma tentativa inteira. */
const CONNECTION_TIMEOUT_MS = 10_000
const SOCKET_TIMEOUT_MS = 20_000
const SEND_TIMEOUT_MS = 30_000
/** Uma nova tentativa só para falhas temporárias (4xx, conexão caída) — nunca para timeout. */
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 750
const DEDUPE_WINDOW_MS = 60_000

const MESSAGES: Record<EmailFailure, string> = {
  not_configured: "O envio de e-mails ainda não está configurado. Fale com o suporte da Íntegra.",
  invalid_recipient: "Endereço de e-mail inválido.",
  rejected: "O servidor de e-mail recusou este endereço. Confira o e-mail informado.",
  auth: "O envio de e-mails está indisponível no momento. Fale com o suporte da Íntegra.",
  timeout: "O servidor de e-mail demorou demais para responder. Tente de novo em instantes.",
  unavailable: "O servidor de e-mail está indisponível no momento. Tente de novo em instantes.",
  unexpected: "Não foi possível enviar o e-mail agora. Tente de novo em instantes.",
}

/** Status HTTP para quando o envio é a própria operação (ex.: reenviar convite). */
export const EMAIL_FAILURE_STATUS: Record<EmailFailure, number> = {
  not_configured: 503,
  invalid_recipient: 400,
  rejected: 422,
  auth: 503,
  timeout: 504,
  unavailable: 503,
  unexpected: 502,
}

const fail = (reason: EmailFailure): EmailResult => ({ ok: false, reason, message: MESSAGES[reason] })

/** O que a API devolve ao navegador sobre um envio: nunca código SMTP nem detalhe técnico. */
export function emailStatus(result: EmailResult) {
  return result.ok ? { sent: true } : { sent: false, message: result.message }
}

/* ------------------------------ Configuração ------------------------------ */

type Env = Record<string, string | undefined>

const REQUIRED_ENV = ["BREVO_SMTP_HOST", "BREVO_SMTP_USER", "BREVO_SMTP_PASSWORD", "BREVO_SENDER_EMAIL"] as const

/** Variáveis obrigatórias que faltam (nomes, nunca valores). */
export function missingMailerEnv(env: Env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name]?.trim())
}

/** Configuração do SMTP a partir do ambiente, ou null se incompleta/inválida. */
export function getMailerConfig(env: Env = process.env): MailerConfig | null {
  if (missingMailerEnv(env).length) return null
  const rawPort = env.BREVO_SMTP_PORT?.trim()
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  const address = normalizeEmail(env.BREVO_SENDER_EMAIL!)
  if (!isEmail(address)) return null
  const name = env.BREVO_SENDER_NAME?.replace(/[\r\n"]+/g, " ").trim() || BRAND.name
  return {
    host: env.BREVO_SMTP_HOST!.trim(),
    port,
    secure: port === 465,
    user: env.BREVO_SMTP_USER!.trim(),
    password: env.BREVO_SMTP_PASSWORD!.trim(),
    from: { name, address },
  }
}

export const isMailerConfigured = (env: Env = process.env) => getMailerConfig(env) !== null

let transport: { key: string; transporter: Transporter } | undefined
let testTransporter: Pick<Transporter, "sendMail"> | undefined

/** Só para testes: troca o SMTP por um transporte falso (undefined volta ao real) e limpa a deduplicação. */
export function setTestTransporter(transporter: Pick<Transporter, "sendMail"> | undefined) {
  testTransporter = transporter
  recent.clear()
}

function transporterFor(config: MailerConfig): Pick<Transporter, "sendMail"> {
  if (testTransporter) return testTransporter
  const key = [config.host, config.port, config.user, config.password].join("\n")
  if (transport?.key !== key) {
    transport = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: !config.secure,
        auth: { user: config.user, pass: config.password },
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: CONNECTION_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
        // O corpo é sempre gerado aqui; nunca lê arquivo nem URL por conteúdo de mensagem.
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    }
  }
  return transport.transporter
}

/* -------------------------------- Auxiliares ------------------------------- */

/** `ana@exemplo.com` → `a***@exemplo.com`, para logs. */
export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@")
  return `${local.slice(0, 1)}***@${domain}`
}

/** Destinatário único, normalizado; null se inválido (inclui quebras de linha e vírgulas). */
export function validRecipient(raw: string) {
  const email = normalizeEmail(raw ?? "")
  if (email.length > 254 || /[\s,;<>"]/.test(email) || !isEmail(email)) return null
  return email
}

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim()

function htmlToText(html: string) {
  return html
    .replace(/<(style|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d|tr|div)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const recent = new Map<string, { at: number; result: Promise<EmailResult> }>()

/**
 * Um envio por chave dentro da janela. Pedidos repetidos recebem o resultado do
 * primeiro (em andamento ou concluído com sucesso); falhas liberam a chave na hora,
 * para que dê para tentar de novo. Vale por instância do servidor (memória).
 */
function once(key: string, run: () => Promise<EmailResult>): Promise<EmailResult> {
  const now = Date.now()
  for (const [k, entry] of recent) if (now - entry.at >= DEDUPE_WINDOW_MS) recent.delete(k)
  const hit = recent.get(key)
  if (hit) return hit.result.then((r) => (r.ok ? { ...r, duplicate: true } : r))
  const result = run().then(
    (r) => {
      if (!r.ok) recent.delete(key)
      return r
    },
    (error) => {
      recent.delete(key)
      throw error
    },
  )
  recent.set(key, { at: now, result })
  return result
}

function classify(error: unknown): { reason: EmailFailure; retry: boolean } {
  const { code, responseCode, command } = (error ?? {}) as NodemailerError
  if (code === "EAUTH" || code === "ENOAUTH" || responseCode === 530 || responseCode === 534 || responseCode === 535)
    return { reason: "auth", retry: false }
  // Remetente recusado (ex.: não validado na Brevo): problema de configuração, não de quem recebe.
  if (responseCode && responseCode >= 500 && /^MAIL FROM/i.test(command ?? "")) return { reason: "auth", retry: false }
  if (code === "ETIMEDOUT" || (error instanceof Error && error.name === "TimeoutError")) return { reason: "timeout", retry: false }
  if (responseCode && responseCode >= 400 && responseCode < 500) return { reason: "unavailable", retry: true }
  if (code === "EENVELOPE" || (responseCode && responseCode >= 550 && responseCode <= 553)) return { reason: "rejected", retry: false }
  if (code === "ECONNECTION" || code === "ESOCKET" || code === "EDNS" || code === "ETLS" || code === "EPROTOCOL")
    return { reason: "unavailable", retry: true }
  return { reason: "unexpected", retry: false }
}

function withDeadline<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Tempo esgotado no envio do e-mail.")
      error.name = "TimeoutError"
      reject(error)
    }, ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function deliver(config: MailerConfig, message: EmailMessage & { to: string }): Promise<EmailResult> {
  const transporter = transporterFor(config)
  for (let attempt = 1; ; attempt++) {
    try {
      const info = await withDeadline(
        transporter.sendMail({
          from: config.from,
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          html: message.html,
          text: message.text ?? htmlToText(message.html),
        }),
        SEND_TIMEOUT_MS,
      )
      const accepted = (info.accepted ?? []).map((address) => String(address).toLowerCase())
      if (!accepted.includes(message.to)) {
        console.error("[LEXA · e-mail] Destinatário recusado pelo SMTP", {
          to: maskEmail(message.to),
          response: String(info.response ?? "").slice(0, 200),
        })
        return fail("rejected")
      }
      return { ok: true, messageId: String(info.messageId ?? "") }
    } catch (error) {
      const { reason, retry } = classify(error)
      const detail = error as NodemailerError
      const log = {
        reason,
        attempt,
        code: detail?.code,
        responseCode: detail?.responseCode,
        command: detail?.command,
        // Resposta do servidor SMTP (ex.: "535 Authentication failed"); nunca as credenciais.
        response: typeof detail?.response === "string" ? detail.response.slice(0, 200) : undefined,
        to: maskEmail(message.to),
      }
      if (retry && attempt < MAX_ATTEMPTS) {
        console.warn("[LEXA · e-mail] Falha temporária; tentando de novo", log)
        await wait(RETRY_DELAY_MS)
        continue
      }
      console.error(
        reason === "auth"
          ? "[LEXA · e-mail] O SMTP recusou o login ou o remetente. Confira BREVO_SMTP_USER, BREVO_SMTP_PASSWORD, BREVO_SENDER_EMAIL (remetente validado na Brevo) e se o IP deste servidor está autorizado na Brevo."
          : "[LEXA · e-mail] Falha no envio",
        log,
      )
      return fail(reason)
    }
  }
}

function notConfigured(env: Env = process.env) {
  console.error(
    "[LEXA · e-mail] SMTP não configurado. Defina no ambiente do servidor:",
    missingMailerEnv(env).join(", ") || "BREVO_SMTP_PORT/BREVO_SENDER_EMAIL válidos",
  )
  return fail("not_configured")
}

/* --------------------------------- Envio ---------------------------------- */

/** Envia um e-mail transacional. Nunca lança por falha de envio. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (typeof window !== "undefined") throw new Error("sendEmail só pode rodar no servidor.")
  const to = validRecipient(message.to)
  if (!to) return fail("invalid_recipient")
  const subject = oneLine(message.subject).slice(0, 200)
  if (!subject || !message.html.trim()) return fail("unexpected")
  const config = getMailerConfig()
  if (!config) return notConfigured()

  const run = () => deliver(config, { ...message, to, subject, replyTo: (message.replyTo && validRecipient(message.replyTo)) || undefined })
  return message.dedupeKey ? once(message.dedupeKey, run) : run()
}

export interface AuthLinkInput {
  to: string
  kind: AuthLinkKind
  /**
   * Gera o link de uso único. Só é chamada se o envio vai acontecer: gerar um link
   * novo invalida o anterior no Supabase, então pedidos repetidos na mesma janela
   * reaproveitam o e-mail já enviado em vez de gerar outro.
   */
  createLink: () => Promise<string>
  name?: string
  organizationName?: string
}

/**
 * Convite e recuperação de senha. Sem SMTP configurado: em desenvolvimento o link sai
 * no terminal (como antes); em produção nada é gerado nem registrado.
 */
export async function sendAuthLink({ to: raw, kind, createLink, name, organizationName }: AuthLinkInput): Promise<EmailResult> {
  if (typeof window !== "undefined") throw new Error("sendAuthLink só pode rodar no servidor.")
  const to = validRecipient(raw)
  if (!to) return fail("invalid_recipient")
  const config = getMailerConfig()
  const devLog = !config && process.env.NODE_ENV !== "production"
  if (!config && !devLog) return notConfigured()

  // Uma chave por pessoa (não por tipo): convite e recuperação usam o mesmo token.
  return once(`auth-link:${to}`, async () => {
    let url: string
    try {
      url = await createLink()
    } catch (error) {
      console.warn("[LEXA · e-mail] Não foi possível gerar o link", { kind, to: maskEmail(to), error: (error as Error)?.message })
      return fail("unexpected")
    }
    const email = renderAuthEmail(kind, { url, name, organizationName })
    if (!config) {
      console.info(
        `\n[LEXA · e-mail] SMTP não configurado (só em desenvolvimento o link aparece aqui)\n  ${email.subject}\n  Para: ${to}\n  Link: ${url}\n`,
      )
      return fail("not_configured")
    }
    return deliver(config, { to, ...email })
  })
}
