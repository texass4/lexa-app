/*
 * Sessão da pessoa dona da Mesa. Um único acesso, protegido por senha definida no servidor
 * (`DESK_PASSWORD` ou `DESK_PASSWORD_HASH`). O cookie é assinado com HMAC-SHA-256 usando
 * `DESK_SESSION_SECRET`; sem segredo válido nada abre (falha fechada).
 *
 * Usa só Web Crypto, para funcionar igual no proxy e nas rotas.
 */

export const SESSION_COOKIE = "mesa_session"
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

const encoder = new TextEncoder()

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ""
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export type AuthConfig = { ok: true; secret: string } | { ok: false; reason: string }

/** Confere se a autenticação está configurada. Sem isso, o app inteiro fica fechado. */
export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const secret = env.DESK_SESSION_SECRET ?? ""
  if (secret.length < 32) return { ok: false, reason: "Defina DESK_SESSION_SECRET com pelo menos 32 caracteres." }
  if (!env.DESK_PASSWORD && !env.DESK_PASSWORD_HASH) return { ok: false, reason: "Defina DESK_PASSWORD (ou DESK_PASSWORD_HASH)." }
  return { ok: true, secret }
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
}

/** Token `payload.assinatura`. O payload só tem datas: não há dado pessoal no cookie. */
export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify({ v: 1, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS })))
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload))
  return `${payload}.${b64url(signature)}`
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token || token.length > 512) return false
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return false
  try {
    // `verify` compara em tempo constante.
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(signature), encoder.encode(payload))
    if (!valid) return false
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { v?: number; exp?: number }
    return data.v === 1 && typeof data.exp === "number" && data.exp * 1000 > now
  } catch {
    return false
  }
}

/** Compara duas strings em tempo constante (via HMAC das duas com uma chave aleatória). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const [ha, hb] = await Promise.all([crypto.subtle.sign("HMAC", key, encoder.encode(a)), crypto.subtle.sign("HMAC", key, encoder.encode(b))])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!
  return diff === 0
}

/**
 * Hash de senha no formato `pbkdf2$<iterações>$<sal>$<hash>` (PBKDF2-SHA-256). Gere com
 * `npm run auth:hash -- "sua senha"` para não deixar a senha em texto puro no ambiente.
 */
export async function hashPassword(password: string, iterations = 310_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await pbkdf2(password, salt, iterations)
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(bits)}`
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256)
}

export async function checkPassword(password: string, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  if (!password || password.length > 1024) return false
  const hash = env.DESK_PASSWORD_HASH
  if (hash) {
    const [scheme, iter, salt, expected] = hash.split("$")
    if (scheme !== "pbkdf2" || !iter || !salt || !expected) return false
    const bits = await pbkdf2(password, fromB64url(salt), Number(iter))
    return safeEqual(b64url(bits), expected)
  }
  const plain = env.DESK_PASSWORD
  return plain ? safeEqual(password, plain) : false
}
