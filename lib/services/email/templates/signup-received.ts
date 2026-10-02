import { BRAND } from "@/lib/core/brand"
import { escapeHtml, greeting, layout, oneLine, plainText, type RenderedEmail } from "./layout"

export interface SignupReceivedEmailInput {
  /** Tela de entrar (não é link de uso único: a conta já nasce confirmada). */
  url: string
  name?: string
  organizationName?: string
  /** O escritório ainda aguarda aprovação da equipe da Íntegra. */
  pending: boolean
}

/** Aviso de cadastro recebido, enviado depois do cadastro público. */
export function renderSignupReceivedEmail(input: SignupReceivedEmailInput): RenderedEmail {
  const name = oneLine(input.name, 80)
  const office = oneLine(input.organizationName)
  const { url, pending } = input
  const subject = `Recebemos seu cadastro na ${BRAND.name}`
  const received = office
    ? `Recebemos o cadastro do escritório <strong>${escapeHtml(office)}</strong> na ${BRAND.name}. A conta já está ligada a este e-mail.`
    : `Recebemos o seu cadastro na ${BRAND.name}. A conta já está ligada a este e-mail.`
  const next = pending
    ? "O acesso é liberado depois da aprovação da equipe da Íntegra. Quando estiver liberado, entre com a senha que você criou."
    : "Já dá para entrar com a senha que você criou."
  const note = `Se você não fez este cadastro, ignore este e-mail.`
  return {
    subject,
    html: layout({
      subject,
      preheader: pending ? "Seu cadastro está em análise." : "Seu escritório está pronto.",
      heading: `Boas-vindas à ${BRAND.name}`,
      paragraphs: [escapeHtml(greeting(name)), received, next],
      button: { label: `Acessar a ${BRAND.name}`, url },
      note,
    }),
    text: plainText([
      greeting(name),
      office ? `Recebemos o cadastro do escritório ${office} na ${BRAND.name}.` : `Recebemos o seu cadastro na ${BRAND.name}.`,
      `${next}\n${url}`,
      note,
    ]),
  }
}
