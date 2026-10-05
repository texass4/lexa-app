import { createHmac } from "node:crypto"

/**
 * Segredo das proteções do cadastro (assinatura dos desafios e hash das chaves de
 * limite). `AUTH_FORM_SECRET` quando definido; senão, derivado da service role, que
 * já é um segredo só do servidor — não exige configuração nova.
 */
function secret() {
  const own = process.env.AUTH_FORM_SECRET?.trim()
  if (own && own.length >= 32) return own
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente: as proteções do cadastro precisam de um segredo do servidor.")
  return createHmac("sha256", base).update("integra:auth-protection:v1").digest("hex")
}

/** HMAC curto e estável de um valor, para um propósito. Não dá para voltar ao valor. */
export function keyed(purpose: string, value: string) {
  return createHmac("sha256", secret()).update(`${purpose}\n${value}`).digest("base64url")
}
