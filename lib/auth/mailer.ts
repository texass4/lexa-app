import {
  EmailError,
  isEmailConfigured,
  maskEmail,
  renderAuthEmail,
  renderSignupReceivedEmail,
  sendEmail,
  validRecipient,
  type EmailFailureReason,
  type SignupReceivedEmailInput,
} from "@/lib/services/email"

/**
 * E-mails de autenticação (convite e recuperação de senha) sobre o serviço de e-mail
 * (`lib/services/email`). Aqui fica só a regra da Íntegra: gerar o link na hora
 * certa, não gerar dois links seguidos e não deixar falha de envio derrubar a
 * operação principal — o resultado volta como `EmailResult`, sem lançar.
 */

export type AuthLinkKind = "recovery" | "invite"

export type EmailResult =
  | { ok: true; messageId: string; /** true = já enviado há instantes; nada saiu de novo. */ duplicate?: boolean }
  | {
      ok: false
      reason: EmailFailureReason
      /** Seguro para mostrar a quem usa a Íntegra. */
      message: string
      /** Status HTTP quando o envio é a própria operação (ex.: reenviar convite). */
      status: number
    }

const fail = (reason: EmailFailureReason): EmailResult => {
  const { message, status } = new EmailError(reason)
  return { ok: false, reason, message, status }
}

/** O que a API devolve ao navegador sobre um envio: nunca código SMTP nem detalhe técnico. */
export function emailStatus(result: EmailResult) {
  return result.ok ? { sent: true } : { sent: false, message: result.message }
}

/** Pedidos repetidos para a mesma pessoa dentro desta janela reaproveitam o envio anterior. */
const DEDUPE_WINDOW_MS = 60_000
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
 * no terminal (para testar localmente); em produção nada é gerado nem registrado.
 */
export async function sendAuthLink({ to: raw, kind, createLink, name, organizationName }: AuthLinkInput): Promise<EmailResult> {
  if (typeof window !== "undefined") throw new Error("sendAuthLink só pode rodar no servidor.")
  const to = validRecipient(raw)
  if (!to) return fail("invalid_recipient")
  const configured = isEmailConfigured()
  if (!configured && process.env.NODE_ENV === "production") {
    console.error("[LEXA · e-mail] SMTP não configurado: o link de acesso não foi gerado. Defina as variáveis SMTP_*.")
    return fail("not_configured")
  }

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
    if (!configured) {
      console.info(
        `\n[LEXA · e-mail] SMTP não configurado (só em desenvolvimento o link aparece aqui)\n  ${email.subject}\n  Para: ${to}\n  Link: ${url}\n`,
      )
      return fail("not_configured")
    }
    try {
      const { messageId } = await sendEmail({ to, ...email })
      return { ok: true, messageId }
    } catch (error) {
      if (error instanceof EmailError) return fail(error.reason)
      console.error("[LEXA · e-mail] Erro inesperado no envio", { kind, to: maskEmail(to), error: (error as Error)?.message })
      return fail("unexpected")
    }
  })
}

/**
 * Aviso de cadastro recebido (cadastro público). Não é link de uso único: a conta já
 * nasce confirmada e o botão leva à tela de entrar. Nunca lança — o cadastro não
 * depende do e-mail. Sem SMTP, só registra no log.
 */
export async function sendSignupEmail(to: string, input: Omit<SignupReceivedEmailInput, "url"> & { loginUrl: string }): Promise<EmailResult> {
  if (typeof window !== "undefined") throw new Error("sendSignupEmail só pode rodar no servidor.")
  const recipient = validRecipient(to)
  if (!recipient) return fail("invalid_recipient")
  if (!isEmailConfigured()) {
    console.info(`[LEXA · e-mail] SMTP não configurado: aviso de cadastro para ${maskEmail(recipient)} não enviado.`)
    return fail("not_configured")
  }
  const { loginUrl, ...rest } = input
  try {
    const { messageId } = await sendEmail({ to: recipient, ...renderSignupReceivedEmail({ ...rest, url: loginUrl }) })
    return { ok: true, messageId }
  } catch (error) {
    if (error instanceof EmailError) return fail(error.reason)
    console.error("[LEXA · e-mail] Erro inesperado no aviso de cadastro", { to: maskEmail(recipient), error: (error as Error)?.message })
    return fail("unexpected")
  }
}
