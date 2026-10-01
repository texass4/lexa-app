/**
 * E-mails transacionais da Íntegra. HTML em tabela, com estilos no elemento,
 * para clientes que ignoram <style>. O texto puro repete o link.
 */

import { BRAND, BRAND_COLORS } from "@/lib/brand"

export type AuthLinkKind = "recovery" | "invite" | "confirm"

const SUBJECT: Record<AuthLinkKind, string> = {
  invite: "Você foi convidado para a Íntegra",
  recovery: "Redefinir sua senha na Íntegra",
  confirm: "Confirme seu cadastro na Íntegra",
}

const COPY: Record<AuthLinkKind, { lead: string; action: string; note: string }> = {
  invite: {
    lead: "Você recebeu um convite para entrar em um escritório na Íntegra. Crie sua senha pelo botão abaixo para acessar.",
    action: "Criar senha e entrar",
    note: "O link vale por 1 hora e só pode ser usado uma vez. Se você não esperava este convite, ignore este e-mail.",
  },
  recovery: {
    lead: "Recebemos um pedido para redefinir a senha da sua conta na Íntegra. Se foi você, use o botão abaixo.",
    action: "Redefinir senha",
    note: "O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.",
  },
  confirm: {
    lead: "Recebemos o cadastro deste e-mail na Íntegra. Ele já está associado à sua conta. Entre com a senha que você criou.",
    action: "Acessar a Íntegra",
    note: "O acesso ao escritório segue a aprovação da equipe da Íntegra. Se você não fez este cadastro, ignore este e-mail.",
  },
}

export function authEmailSubject(kind: AuthLinkKind) {
  return SUBJECT[kind]
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Mensagem pronta para o SMTP. `url` é o link de uso único (ou a tela de entrar, na confirmação). */
export function renderAuthEmail(kind: AuthLinkKind, url: string) {
  const copy = COPY[kind]
  const safeUrl = escapeHtml(url)
  const { navy, blue, paper } = BRAND_COLORS
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:${paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:${navy};">
                ${BRAND.name}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#5f6b7d;">
                ${BRAND.tagline}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.4;color:${navy};font-weight:bold;">
                ${SUBJECT[kind]}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0e1726;">
                ${copy.lead}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:${blue};">
                      <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">
                        ${copy.action}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#5f6b7d;">
                Se o botão não abrir, copie este endereço no navegador:
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;">
                <a href="${safeUrl}" style="color:${blue};">${safeUrl}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#5f6b7d;">
                ${copy.note}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [`${BRAND.name} — ${SUBJECT[kind]}`, "", copy.lead, "", `${copy.action}: ${url}`, "", copy.note].join("\n")
  return { subject: SUBJECT[kind], html, text }
}
