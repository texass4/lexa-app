/**
 * Envio único de e-mail transacional da Íntegra, por SMTP da Brevo.
 *
 * Só o servidor importa este arquivo. Convite, recuperação e confirmação passam
 * por `sendAuthLink`; outros e-mails usam `sendEmail`. Nada aqui vai para o
 * navegador e a senha SMTP nunca entra em log.
 *
 * O Supabase Auth não lê estas variáveis. E-mails que o próprio Auth disparar
 * (se a confirmação nativa for ligada no painel) usam o SMTP configurado lá,
 * com os mesmos dados. Veja o README.
 */

import nodemailer from "nodemailer"
import { BRAND } from "@/lib/brand"
import { isEmail, normalizeEmail } from "@/lib/auth/validation"
import { authEmailSubject, renderAuthEmail, type AuthLinkKind } from "./email-templates"

export type { AuthLinkKind }

const TIMEOUT_MS = 10_000
/** Segunda chamada igual, neste intervalo, não dispara outro SMTP. */
const DEDUPE_MS = 20_000

export type EmailFailure = "invalid_recipient" | "not_configured" | "timeout" | "temporary" | "rejected"

export type EmailResult = { ok: true } | { ok: false; code: EmailFailure }

export interface OutboundEmail {
  to: string
  subject: string
  html: string
  text?: string
}

interface MailConfig {
  host: string
  port: number
  user: string
  password: string
  senderEmail: string
  senderName: string
}

interface SmtpError {
  code?: string
  responseCode?: number
}

const reserved = new Map<string, number>()

function sendKey(email: string, kind: string) {
  return `${normalizeEmail(email)}\n${kind}`
}

/**
 * Reserva o envio deste tipo para o destinatário. `false` = já houve um envio
 * igual nos últimos 20 s (não gere outro link). Em falha, chame `releaseSend`.
 */
export function claimSend(email: string, kind: string) {
  const key = sendKey(email, kind)
  const at = reserved.get(key)
  if (at && Date.now() - at < DEDUPE_MS) return false
  reserved.set(key, Date.now())
  return true
}

export function releaseSend(email: string, kind: string) {
  reserved.delete(sendKey(email, kind))
}

function env(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

/** Configuração completa, ou `null` quando falta remetente ou credencial. O host público da Brevo entra se `BREVO_SMTP_HOST` estiver vazio. */
export function readMailConfig(): MailConfig | null {
  const user = env("BREVO_SMTP_USER")
  const password = env("BREVO_SMTP_PASSWORD")
  const senderEmail = env("BREVO_SENDER_EMAIL")
  if (!user || !password || !senderEmail || !isEmail(senderEmail)) return null
  const port = Number(env("BREVO_SMTP_PORT") ?? "587")
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return {
    host: env("BREVO_SMTP_HOST") ?? "smtp-relay.brevo.com",
    port,
    user,
    password,
    senderEmail: normalizeEmail(senderEmail),
    senderName: env("BREVO_SENDER_NAME") ?? BRAND.name,
  }
}

function classify(error: SmtpError): EmailFailure {
  const code = error.code ?? ""
  if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION" || code === "EDNS" || code === "ETIMEOUT") return "timeout"
  const response = error.responseCode ?? 0
  if (code === "EAUTH" || (response >= 500 && response < 600)) return "rejected"
  return "temporary"
}

function logFailure(code: EmailFailure, to: string, error?: SmtpError) {
  const at = to.includes("@") ? `${to.slice(0, 2)}…@${to.split("@")[1]}` : "invalid"
  console.error("[mail]", code, { to: at, smtp: error?.code, status: error?.responseCode })
}

/**
 * Envia um e-mail. Não lança: falha de SMTP volta como `EmailResult` para a
 * operação principal (convite, cadastro, recuperação) seguir.
 */
export async function sendEmail(input: OutboundEmail): Promise<EmailResult> {
  const to = normalizeEmail(input.to)
  if (!isEmail(to) || /[\r\n]/.test(input.subject)) {
    logFailure("invalid_recipient", to)
    return { ok: false, code: "invalid_recipient" }
  }

  const config = readMailConfig()
  if (!config) {
    logFailure("not_configured", to)
    return { ok: false, code: "not_configured" }
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  })

  try {
    await transport.sendMail({
      from: { name: config.senderName, address: config.senderEmail },
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
    return { ok: true }
  } catch (error) {
    const smtp = error as SmtpError
    const code = classify(smtp)
    logFailure(code, to, smtp)
    return { ok: false, code }
  } finally {
    transport.close()
  }
}

/**
 * Convite, recuperação ou confirmação de cadastro. Em desenvolvimento, sem SMTP
 * configurado, o link sai no terminal para o fluxo continuar testável. Em
 * produção o link não é impresso.
 */
export async function sendAuthLink(email: string, kind: AuthLinkKind, url: string): Promise<EmailResult> {
  const message = renderAuthEmail(kind, url)
  const result = await sendEmail({ to: email, subject: message.subject, html: message.html, text: message.text })
  if (!result.ok && result.code === "not_configured" && process.env.NODE_ENV !== "production") {
    console.info(`\n[Íntegra · e-mail não configurado] ${authEmailSubject(kind)}\n  Para: ${normalizeEmail(email)}\n  Link: ${url}\n`)
  }
  return result
}
