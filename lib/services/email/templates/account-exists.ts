import { BRAND } from "@/lib/core/brand"
import { escapeHtml, layout, plainText, type RenderedEmail } from "./layout"

export interface AccountExistsEmailInput {
  /** Tela de entrar. */
  loginUrl: string
  /** Tela de recuperar a senha. */
  recoverUrl: string
}

/**
 * Alguém pediu um cadastro com um e-mail que já tem conta. A tela do cadastro mostra
 * a mesma resposta de sempre (não revela que a conta existe); só o dono do e-mail
 * fica sabendo, por aqui.
 */
export function renderAccountExistsEmail({ loginUrl, recoverUrl }: AccountExistsEmailInput): RenderedEmail {
  const subject = `Tentativa de cadastro na ${BRAND.name}`
  const lead = `Recebemos um pedido de cadastro na ${BRAND.name} com este e-mail, mas ele já tem uma conta. Nenhuma conta nova foi criada.`
  const next = "Se foi você, entre com a sua senha. Se não lembra dela, recupere o acesso:"
  const note = "Se você não fez esse pedido, ignore este e-mail: sua conta continua como está."
  return {
    subject,
    html: layout({
      subject,
      preheader: "Este e-mail já tem uma conta.",
      heading: "Você já tem uma conta",
      paragraphs: [lead, `${next} <a href="${escapeHtml(recoverUrl)}">recuperar a senha</a>.`],
      button: { label: `Entrar na ${BRAND.name}`, url: loginUrl },
      note,
    }),
    text: plainText([lead, `Entrar: ${loginUrl}`, `Recuperar a senha: ${recoverUrl}`, note]),
  }
}
