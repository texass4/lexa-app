import { BRAND } from "@/lib/core/brand"
import { escapeHtml, greeting, layout, oneLine, plainText, type RenderedEmail } from "./layout"

export interface PasswordResetEmailInput {
  /** Link de uso único para definir a nova senha. */
  url: string
  name?: string
}

/** Recuperação / redefinição de senha. */
export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const name = oneLine(input.name, 80)
  const { url } = input
  const subject = `Redefinir sua senha na ${BRAND.name}`
  const note =
    "O link é de uso único e expira em pouco tempo. Se você não pediu a redefinição, ignore este e-mail — sua senha atual continua valendo."
  return {
    subject,
    html: layout({
      subject,
      preheader: "Use o link para criar uma nova senha.",
      heading: "Redefinição de senha",
      paragraphs: [
        escapeHtml(greeting(name)),
        `Recebemos um pedido para redefinir a senha da sua conta na ${BRAND.name}. Para criar uma nova senha, use o botão abaixo:`,
      ],
      button: { label: "Criar nova senha", url },
      note,
    }),
    text: plainText([
      greeting(name),
      `Recebemos um pedido para redefinir a senha da sua conta na ${BRAND.name}. Para criar uma nova senha, acesse:\n${url}`,
      note,
    ]),
  }
}
