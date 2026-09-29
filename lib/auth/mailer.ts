export type AuthLinkKind = "recovery" | "invite"

const SUBJECT: Record<AuthLinkKind, string> = {
  recovery: "Redefinir sua senha na Íntegra",
  invite: "Você foi convidado para a Íntegra",
}

/**
 * Envio dos links de recuperação e convite. Ainda não há provedor de e-mail: o link
 * sai no terminal do servidor. Para enviar de verdade, troque só esta função.
 */
export async function sendAuthLink(email: string, kind: AuthLinkKind, url: string) {
  console.info(`\n[LEXA · e-mail] ${SUBJECT[kind]}\n  Para: ${email}\n  Link: ${url}\n`)
}
