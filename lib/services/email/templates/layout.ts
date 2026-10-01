import { BRAND, BRAND_COLORS } from "@/lib/core/brand"

/**
 * Moldura comum dos e-mails da Íntegra. HTML para clientes de e-mail: tabelas, estilos
 * inline, largura máxima de 560 px, sem imagens nem fontes externas (muitos clientes
 * bloqueiam) e sempre com versão em texto.
 */

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const COLORS = {
  page: BRAND_COLORS.paper,
  card: "#FFFFFF",
  border: "#E4E7EC",
  heading: BRAND_COLORS.navy,
  body: "#0E1726",
  muted: "#5F6B7D",
  button: BRAND_COLORS.navy,
  link: BRAND_COLORS.blue,
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** Texto curto de uma linha (nome, escritório): sem quebras e com tamanho limitado. */
export function oneLine(value: string | undefined, max = 120) {
  const clean = value?.replace(/\s+/g, " ").trim() ?? ""
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

interface Layout {
  subject: string
  /** Texto de prévia que alguns clientes mostram ao lado do assunto. */
  preheader: string
  heading: string
  /** Parágrafos já em HTML seguro. */
  paragraphs: string[]
  button: { label: string; url: string }
  /** Aviso final (segurança / "não foi você?"), já em HTML seguro. */
  note: string
}

export function layout({ subject, preheader, heading, paragraphs, button, note }: Layout) {
  const url = escapeHtml(button.url)
  const p = (html: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${COLORS.body};">${html}</p>`
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  @media (max-width: 600px) {
    .integra-card { padding: 28px 22px !important; }
    .integra-button a { display: block !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 20px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.3px;color:${COLORS.heading};">${BRAND.name}</td>
        </tr>
        <tr>
          <td class="integra-card" style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:14px;padding:36px;font-family:${FONT};">
            <h1 style="margin:0 0 20px;font-size:20px;line-height:28px;font-weight:600;color:${COLORS.heading};">${escapeHtml(heading)}</h1>
            ${paragraphs.map(p).join("\n            ")}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
              <tr>
                <td class="integra-button" align="center" bgcolor="${COLORS.button}" style="border-radius:10px;background-color:${COLORS.button};">
                  <a href="${url}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(button.label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 6px;font-size:13px;line-height:20px;color:${COLORS.muted};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
            <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;"><a href="${url}" target="_blank" style="color:${COLORS.link};text-decoration:underline;">${url}</a></p>
            <p style="margin:0;padding-top:20px;border-top:1px solid ${COLORS.border};font-size:13px;line-height:20px;color:${COLORS.muted};">${note}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">
            ${BRAND.name} — ${escapeHtml(BRAND.tagline)}.<br>
            Este é um e-mail automático; não é preciso respondê-lo.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`
}

export function plainText(lines: string[]) {
  return `${lines.join("\n\n")}\n\n— ${BRAND.name} · ${BRAND.tagline}\nEste é um e-mail automático; não é preciso respondê-lo.\n`
}

export const greeting = (name: string) => (name ? `Olá, ${name}.` : "Olá.")
