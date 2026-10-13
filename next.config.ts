import type { NextConfig } from "next"

/**
 * `npm run dev` aberto por um túnel (ex.: para a Meta entregar o webhook do WhatsApp):
 * o Next bloqueia os arquivos de desenvolvimento vindos de outro domínio e a página não
 * funciona (botões não respondem). Liberados: os túneis rápidos do Cloudflare e do ngrok
 * e, em `DEV_ALLOWED_ORIGINS`, outros domínios separados por vírgula (só o nome, sem
 * https:// nem porta). Vale só em desenvolvimento; não afeta o `next start`.
 */
const tunnels = ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app"]
const extra = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [...tunnels, ...extra],
}

export default nextConfig
