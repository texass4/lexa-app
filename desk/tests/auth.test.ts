import { describe, expect, it } from "vitest"
import { authConfig, checkPassword, createSessionToken, hashPassword, verifySessionToken } from "@/lib/auth/session"

const secret = "s".repeat(40)

describe("autenticação", () => {
  it("falha fechada sem configuração", () => {
    expect(authConfig({}).ok).toBe(false)
    expect(authConfig({ DESK_SESSION_SECRET: "curto", DESK_PASSWORD: "x" }).ok).toBe(false)
    expect(authConfig({ DESK_SESSION_SECRET: secret }).ok).toBe(false)
    expect(authConfig({ DESK_SESSION_SECRET: secret, DESK_PASSWORD: "x" }).ok).toBe(true)
  })

  it("aceita só tokens assinados com o segredo e dentro da validade", async () => {
    const now = Date.now()
    const token = await createSessionToken(secret, now)
    expect(await verifySessionToken(token, secret, now)).toBe(true)
    expect(await verifySessionToken(token, "o".repeat(40), now)).toBe(false)
    expect(await verifySessionToken(token, secret, now + 31 * 24 * 3600 * 1000)).toBe(false)
    const [payload, sig] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ v: 1, iat: 0, exp: 9_999_999_999 })).toString("base64url")
    expect(await verifySessionToken(`${forged}.${sig}`, secret, now)).toBe(false)
    expect(await verifySessionToken(`${payload}.`, secret, now)).toBe(false)
    expect(await verifySessionToken(undefined, secret, now)).toBe(false)
  })

  it("confere senha em texto e em hash PBKDF2", async () => {
    expect(await checkPassword("certa", { DESK_PASSWORD: "certa" })).toBe(true)
    expect(await checkPassword("errada", { DESK_PASSWORD: "certa" })).toBe(false)
    const hash = await hashPassword("minha senha", 1000)
    expect(await checkPassword("minha senha", { DESK_PASSWORD_HASH: hash })).toBe(true)
    expect(await checkPassword("outra", { DESK_PASSWORD_HASH: hash })).toBe(false)
    expect(await checkPassword("", { DESK_PASSWORD: "" })).toBe(false)
  })
})
