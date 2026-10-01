import { BRAND } from "@/lib/core/brand"
import { escapeHtml, greeting, layout, oneLine, plainText, type RenderedEmail } from "./layout"

export interface EmailConfirmationInput {
  /** Link de uso único para confirmar o endereço. */
  url: string
  name?: string
}

/** Confirmação de e-mail (cadastro). */
export function renderEmailConfirmationEmail(input: EmailConfirmationInput): RenderedEmail {
  const name = oneLine(input.name, 80)
  const { url } = input
  const subject = `Confirme seu e-mail na ${BRAND.name}`
  const note = `O link é de uso único e expira em pouco tempo. Se você não criou uma conta na ${BRAND.name}, ignore este e-mail.`
  return {
    subject,
    html: layout({
      subject,
      preheader: "Confirme seu endereço para concluir o acesso.",
      heading: "Confirme seu e-mail",
      paragraphs: [escapeHtml(greeting(name)), `Falta pouco. Confirme que este endereço é seu para concluir o acesso à ${BRAND.name}:`],
      button: { label: "Confirmar e-mail", url },
      note,
    }),
    text: plainText([greeting(name), `Falta pouco. Confirme que este endereço é seu para concluir o acesso à ${BRAND.name}:\n${url}`, note]),
  }
}
