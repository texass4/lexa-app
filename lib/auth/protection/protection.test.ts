import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { afterEach, before, describe, it } from "node:test"

import { sha256 } from "./sha256"
import { leadingZeroBits, meetsDifficulty, solveChallenge } from "./pow"
import { CHALLENGE_MAX_AGE_MS, CHALLENGE_MIN_AGE_MS, checkChallenge, issueChallenge } from "./challenge"
import { allow, enforce, LIMITS, memoryStore, setRateStoreForTests, TOO_MANY, type RateStore } from "./rate-limit"
import { isHoneypot, requireChallenge } from "./guard"
import { clientIp } from "./client-ip"
import { atLeast } from "./timing"
import { warnIfPublicSignupOpen } from "./auth-settings"
import http from "node:http"
import { HttpError } from "@/lib/auth/http-error"

before(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-de-teste"
  process.env.AUTH_POW_DIFFICULTY = "10"
})
afterEach(() => setRateStoreForTests(undefined))

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

async function solved(purpose: "signup" | "recover" | "resend", issuedAt: number) {
  const { token, difficulty } = issueChallenge(purpose, issuedAt)
  return { token, solution: await solveChallenge(token, difficulty) }
}

describe("SHA-256 em JavaScript (prova de trabalho no navegador)", () => {
  it("é idêntico ao do Node para entradas curtas, longas e com acento", () => {
    for (const input of ["", "abc", "a".repeat(55), "a".repeat(56), "b".repeat(64), "c".repeat(1000), "cadastro:ação·Íntegra"]) {
      assert.equal(hex(sha256(input)), createHash("sha256").update(input).digest("hex"), JSON.stringify(input.slice(0, 20)))
    }
  })

  it("conta os bits zero do começo", () => {
    assert.equal(leadingZeroBits(new Uint8Array([0, 0, 0x0f])), 20)
    assert.equal(leadingZeroBits(new Uint8Array([0x80])), 0)
    assert.equal(leadingZeroBits(new Uint8Array([0, 1])), 15)
  })
})

describe("desafio anti-bot", () => {
  it("resolvido e enviado depois da espera mínima: aceito", async () => {
    const issuedAt = Date.now() - CHALLENGE_MIN_AGE_MS - 1000
    const { token, solution } = await solved("signup", issuedAt)
    assert.equal(meetsDifficulty(token, solution, 10), true)
    assert.deepEqual(checkChallenge(token, solution, "signup").ok, true)
  })

  it("recusa script: sem desafio, solução errada, assinatura adulterada, outro formulário, rápido demais, vencido", async () => {
    const old = Date.now() - CHALLENGE_MIN_AGE_MS - 1000
    const { token, solution } = await solved("signup", old)
    assert.deepEqual(checkChallenge(undefined, undefined, "signup"), { ok: false, reason: "invalid" })
    assert.equal(checkChallenge(token, "zzzz-errada", "signup").ok, false)
    const wrong = ["0", "1", "2", "3", "4", "5"].find((nonce) => !meetsDifficulty(token, nonce, 10))!
    assert.deepEqual(checkChallenge(token, wrong, "signup"), { ok: false, reason: "work" })
    const tampered = token.replace(/\.(\d+)\./, ".8.") // baixa a dificuldade sem reassinar
    assert.deepEqual(checkChallenge(tampered, solution, "signup"), { ok: false, reason: "invalid" })
    assert.deepEqual(checkChallenge(token, solution, "recover"), { ok: false, reason: "invalid" })

    const fresh = await solved("signup", Date.now())
    assert.deepEqual(checkChallenge(fresh.token, fresh.solution, "signup"), { ok: false, reason: "too_fast" })
    const expired = await solved("signup", Date.now() - CHALLENGE_MAX_AGE_MS - 1000)
    assert.deepEqual(checkChallenge(expired.token, expired.solution, "signup"), { ok: false, reason: "expired" })
  })

  it("cada desafio vale para um envio só (reaproveitar = recusado)", async () => {
    setRateStoreForTests(memoryStore)
    const { token, solution } = await solved("signup", Date.now() - CHALLENGE_MIN_AGE_MS - 1000)
    await requireChallenge({ challenge: token, solution }, "signup")
    await assert.rejects(requireChallenge({ challenge: token, solution }, "signup"), (e: HttpError) => e.status === 400)
  })

  it("campo-isca preenchido = robô", () => {
    assert.equal(isHoneypot({ website: "http://spam.example" }), true)
    assert.equal(isHoneypot({ website: "   " }), false)
    assert.equal(isHoneypot({}), false)
  })
})

describe("limite de tentativas", () => {
  it("bloqueia a partir do limite, com a mesma mensagem genérica", async () => {
    setRateStoreForTests(memoryStore)
    for (let i = 0; i < LIMITS.signupIp.limit; i++) await enforce([LIMITS.signupIp, "203.0.113.7"])
    await assert.rejects(enforce([LIMITS.signupIp, "203.0.113.7"]), (e: HttpError) => e.status === 429 && e.message === TOO_MANY)
    // Outro IP continua livre.
    await enforce([LIMITS.signupIp, "198.51.100.1"])
  })

  it("conta todas as regras e guarda só hash (nunca o e-mail ou o IP)", async () => {
    const seen: string[] = []
    const spy: RateStore = (key, limit, window) => (seen.push(key), memoryStore(key, limit, window))
    setRateStoreForTests(spy)
    await enforce([LIMITS.signupIp, "203.0.113.7"], [LIMITS.signupEmail, "Ana@Exemplo.com"])
    assert.equal(seen.length, 2)
    assert.ok(seen.every((key) => !key.includes("exemplo") && !key.includes("203.0")))
    // Maiúsculas não driblam o limite por e-mail.
    await allow(LIMITS.signupEmail, "ana@exemplo.com")
    assert.equal(seen[1], seen[2])
  })

  it("a janela vence e libera de novo", async () => {
    setRateStoreForTests(memoryStore)
    const rule = { id: "teste", limit: 1, windowSeconds: 1 }
    assert.equal(await allow(rule, "x"), true)
    assert.equal(await allow(rule, "x"), false)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    assert.equal(await allow(rule, "x"), true)
  })
})

describe("resposta e origem", () => {
  it("tempo mínimo de resposta, com sucesso ou erro", async () => {
    let start = Date.now()
    await atLeast(150, async () => "ok")
    assert.ok(Date.now() - start >= 150)
    start = Date.now()
    await assert.rejects(atLeast(150, async () => Promise.reject(new Error("x"))))
    assert.ok(Date.now() - start >= 150)
  })

  it("IP pelo cabeçalho do proxy", () => {
    assert.equal(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } })), "203.0.113.7")
    assert.equal(clientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.2" } })), "198.51.100.2")
    assert.equal(clientIp(new Request("http://x")), undefined)
  })
})

describe("cadastro público do Supabase Auth", () => {
  it("avisa no log quando está ligado (dá para criar conta sem passar pela Íntegra)", async () => {
    let open = true
    const server = http.createServer((_req, res) => res.end(JSON.stringify({ disable_signup: !open })))
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const warnings: string[] = []
    const original = console.warn
    console.warn = (message: string) => void warnings.push(message)
    try {
      assert.equal(await warnIfPublicSignupOpen(url, "anon"), false)
      assert.match(warnings[0], /Allow new users to sign up/)
      open = false
      assert.equal(await warnIfPublicSignupOpen(url, "anon"), true)
      assert.equal(warnings.length, 1)
    } finally {
      console.warn = original
      server.close()
    }
  })
})
