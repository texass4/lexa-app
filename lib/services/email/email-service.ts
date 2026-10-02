import nodemailer, { type NodemailerError, type Transporter } from "nodemailer"
import { isEmail, normalizeEmail } from "@/lib/auth/validation"
import { emailConfigProblem, getEmailConfig, type EmailConfig } from "./config"
import { classifySmtpError, EmailError, type EmailFailureReason } from "./errors"

/**
 * Serviço de e-mail da Íntegra — o único ponto do projeto que conhece o Nodemailer e
 * fala com o SMTP. Só roda no servidor (Route Handlers, Server Actions, scripts):
 * as credenciais vêm de `SMTP_*` e nunca chegam ao navegador. Trocar de provedor
 * SMTP é só trocar as variáveis de ambiente.
 */

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  /** Versão em texto. Sem ela, é derivada do HTML. */
  text?: string
  replyTo?: string
}

export interface SendEmailResult {
  messageId: string
  /** Destinatários aceitos pelo servidor SMTP. */
  accepted: string[]
  /** Destinatários recusados (envio parcial). */
  rejected: string[]
}

/** Conexão, saudação e inatividade do SMTP; e o teto de uma tentativa inteira. */
const CONNECTION_TIMEOUT_MS = 10_000
const SOCKET_TIMEOUT_MS = 20_000
const SEND_TIMEOUT_MS = 30_000
/** Uma nova tentativa só para falhas temporárias (4xx, conexão caída) — nunca para timeout. */
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 750
const MAX_RECIPIENTS = 50
const LOG = "[LEXA · e-mail]"

type SmtpTransport = Pick<Transporter, "sendMail" | "verify">

/* ------------------------------- Transporte ------------------------------- */

let transport: { key: string; transporter: SmtpTransport } | undefined
let testTransport: SmtpTransport | undefined

/** Só para testes: troca o SMTP por um transporte falso (undefined volta ao real). */
export function setEmailTransportForTests(transporter: SmtpTransport | undefined) {
  testTransport = transporter
}

/**
 * Um transporter por configuração, reaproveitado entre envios (e entre invocações
 * "quentes" na Vercel). Sem pool: em serverless a conexão não sobrevive entre
 * invocações, então cada envio abre e fecha a sua.
 */
function getTransporter(config: EmailConfig): SmtpTransport {
  if (testTransport) return testTransport
  const key = [config.host, config.port, config.secure, config.user, config.password].join("\n")
  if (transport?.key !== key) {
    transport = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        // Em produção, sem TLS direto, exige STARTTLS: credenciais nunca trafegam em texto puro.
        requireTLS: !config.secure && process.env.NODE_ENV === "production",
        auth: { user: config.user, pass: config.password },
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: CONNECTION_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
        // O conteúdo é sempre gerado pela Íntegra: nunca lê arquivo nem URL a partir da mensagem.
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    }
  }
  return transport.transporter
}

/* -------------------------------- Auxiliares ------------------------------- */

/** `ana@exemplo.com` → `a***@exemplo.com` (e `usuario` → `u***`), para logs. */
export function maskEmail(email: string) {
  const [local = "", domain] = email.split("@")
  return `${local.slice(0, 1)}***${domain === undefined ? "" : `@${domain}`}`
}

/** Destinatário único, normalizado; null se inválido (inclui quebras de linha, listas e nomes). */
export function validRecipient(raw: string) {
  const email = normalizeEmail(raw ?? "")
  if (email.length > 254 || /[\s,;<>"]/.test(email) || !isEmail(email)) return null
  return email
}

function recipients(to: string | string[]) {
  const list = (Array.isArray(to) ? to : [to]).map(validRecipient)
  if (!list.length || list.length > MAX_RECIPIENTS || list.some((email) => !email)) return null
  return [...new Set(list as string[])]
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

function withDeadline<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Tempo esgotado no SMTP.")
      error.name = "TimeoutError"
      reject(error)
    }, ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Só o que ajuda a diagnosticar: código, resposta do servidor e comando. Nunca credenciais. */
function smtpDetail(error: unknown) {
  const detail = (error ?? {}) as NodemailerError
  return {
    code: detail.code,
    responseCode: detail.responseCode,
    command: detail.command,
    response: typeof detail.response === "string" ? detail.response.slice(0, 200) : undefined,
  }
}

function requireConfig() {
  const config = getEmailConfig()
  if (!config) {
    console.error(`${LOG} SMTP não configurado (${emailConfigProblem()}). Defina as variáveis SMTP_* no ambiente do servidor.`)
    throw new EmailError("not_configured")
  }
  return config
}

/* --------------------------------- Envio ---------------------------------- */

/**
 * Envia um e-mail pelo SMTP configurado. Devolve o que o servidor aceitou; lança
 * `EmailError` (mensagem amigável, sem detalhe técnico) se não houver envio.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (typeof window !== "undefined") throw new Error("sendEmail só pode rodar no servidor.")
  const to = recipients(options.to)
  if (!to) throw new EmailError("invalid_recipient")
  const subject = oneLine(options.subject).slice(0, 200)
  if (!subject || !options.html.trim()) {
    console.error(`${LOG} Mensagem sem assunto ou sem conteúdo; nada foi enviado.`)
    throw new EmailError("unexpected")
  }
  const config = requireConfig()
  const transporter = getTransporter(config)
  const replyTo = options.replyTo ? (validRecipient(options.replyTo) ?? undefined) : undefined
  const logTo = to.map(maskEmail).join(", ")

  for (let attempt = 1; ; attempt++) {
    try {
      const info = await withDeadline(
        transporter.sendMail({
          from: config.from,
          to,
          replyTo,
          subject,
          html: options.html,
          text: options.text ?? htmlToText(options.html),
        }),
        SEND_TIMEOUT_MS,
      )
      const accepted = (info.accepted ?? []).map((address) => String(address).toLowerCase())
      const rejected = to.filter((address) => !accepted.includes(address))
      if (!accepted.length) {
        console.error(`${LOG} Destinatário recusado pelo SMTP`, {
          para: logTo,
          assunto: subject,
          response: String(info.response ?? "").slice(0, 200),
        })
        throw new EmailError("rejected")
      }
      if (rejected.length) console.warn(`${LOG} Parte dos destinatários foi recusada`, { recusados: rejected.map(maskEmail).join(", ") })
      console.info(`${LOG} E-mail enviado`, { para: logTo, assunto: subject, messageId: info.messageId })
      return { messageId: String(info.messageId ?? ""), accepted, rejected }
    } catch (error) {
      if (error instanceof EmailError) throw error
      const { reason, retry } = classifySmtpError(error)
      const log = { reason, attempt, para: logTo, assunto: subject, ...smtpDetail(error) }
      if (retry && attempt < MAX_ATTEMPTS) {
        console.warn(`${LOG} Falha temporária; tentando de novo`, log)
        await wait(RETRY_DELAY_MS)
        continue
      }
      console.error(
        reason === "auth"
          ? `${LOG} O SMTP recusou o login ou o remetente. Confira SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL (remetente autorizado no provedor) e se o provedor aceita conexões deste servidor.`
          : `${LOG} Falha no envio`,
        log,
      )
      throw new EmailError(reason)
    }
  }
}

/* --------------------------- Teste de conexão ----------------------------- */

export type EmailConnectionCheck =
  | { configured: false; problem: string }
  | {
      configured: true
      connected: boolean
      authenticated: boolean
      reason?: EmailFailureReason
      /** Diagnóstico do servidor SMTP (código e resposta), sem credenciais. Só para logs/terminal. */
      detail?: ReturnType<typeof smtpDetail>
    }

/**
 * Configurado? → conecta? → autentica? Usa o `verify` do Nodemailer (conecta, faz
 * TLS e login, sem enviar nada). Para uso interno — `npm run email:verify` —, nunca
 * exposto em rota pública.
 */
export async function verifyEmailConnection(): Promise<EmailConnectionCheck> {
  if (typeof window !== "undefined") throw new Error("verifyEmailConnection só pode rodar no servidor.")
  const config = getEmailConfig()
  if (!config) return { configured: false, problem: emailConfigProblem() ?? "configuração inválida" }
  try {
    await withDeadline(getTransporter(config).verify(), SEND_TIMEOUT_MS)
    return { configured: true, connected: true, authenticated: true }
  } catch (error) {
    const { reason } = classifySmtpError(error)
    return { configured: true, connected: reason === "auth", authenticated: false, reason, detail: smtpDetail(error) }
  }
}
