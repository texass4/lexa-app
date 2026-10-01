import { BRAND } from "@/lib/brand"
import { escapeHtml, greeting, layout, oneLine, plainText, type RenderedEmail } from "./layout"

export interface InvitationEmailInput {
  /** Link de uso único para criar a senha. */
  url: string
  name?: string
  organizationName?: string
}

/** Convite para entrar em um escritório na Íntegra. */
export function renderInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const name = oneLine(input.name, 80)
  const office = oneLine(input.organizationName)
  const { url } = input
  const subject = office ? `Convite para ${office} na ${BRAND.name}` : `Você foi convidado para a ${BRAND.name}`
  const invitation = office
    ? `Você foi convidado para fazer parte do escritório <strong>${escapeHtml(office)}</strong> na ${BRAND.name}, a plataforma de gestão jurídica da equipe.`
    : `Você foi convidado para fazer parte de um escritório na ${BRAND.name}, a plataforma de gestão jurídica da equipe.`
  const note =
    "Por segurança, o link é de uso único e expira em pouco tempo. Se ele expirar, peça um novo convite a quem convidou você. Se você não esperava este convite, ignore este e-mail."
  return {
    subject,
    html: layout({
      subject,
      preheader: "Crie sua senha para acessar o escritório.",
      heading: `Boas-vindas à ${BRAND.name}`,
      paragraphs: [escapeHtml(greeting(name)), invitation, "Para começar, crie a sua senha de acesso:"],
      button: { label: "Criar minha senha", url },
      note,
    }),
    text: plainText([
      greeting(name),
      office
        ? `Você foi convidado para fazer parte do escritório ${office} na ${BRAND.name}.`
        : `Você foi convidado para fazer parte de um escritório na ${BRAND.name}.`,
      `Para começar, crie a sua senha de acesso:\n${url}`,
      note,
    ]),
  }
}
