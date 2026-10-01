import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import { emailStatus, sendAuthLink } from "./mailer"
import { setEmailTransportForTests } from "@/lib/services/email/email-service"
import { fakeTransport, SMTP_ENV, smtpError } from "@/lib/services/email/testing"

describe("sendAuthLink", () => {
  const saved = { ...process.env }
  beforeEach(() => Object.assign(process.env, SMTP_ENV))
  afterEach(() => {
    setEmailTransportForTests(undefined)
    for (const key of Object.keys(SMTP_ENV)) delete process.env[key]
    Object.assign(process.env, saved)
  })

  it("gera um link só para pedidos repetidos (gerar outro invalidaria o primeiro)", async () => {
    const sent = fakeTransport()
    let links = 0
    const input = { to: "ana@exemplo.com", kind: "recovery" as const, createLink: async () => `https://app.test/auth/confirm?token_hash=t${++links}` }
    const results = await Promise.all([sendAuthLink(input), sendAuthLink(input), sendAuthLink({ ...input, kind: "invite" })])
    assert.equal(links, 1)
    assert.equal(sent.length, 1)
    assert.ok(results.every((r) => r.ok))
    assert.equal(results.filter((r) => r.ok && r.duplicate).length, 2)
    assert.match(sent[0].html, /token_hash=t1/)
    assert.equal(sent[0].subject, "Redefinir sua senha na Íntegra")
  })

  it("falha de envio vira resultado (não exceção) e libera a chave para tentar de novo", async () => {
    let fail = true
    const sent = fakeTransport((m) => (fail ? smtpError({ code: "ETIMEDOUT" }) : { messageId: "<ok>", accepted: m.to }))
    const input = {
      to: "bia@exemplo.com",
      kind: "invite" as const,
      organizationName: "Silva Advogados",
      createLink: async () => "https://app.test/l",
    }
    const first = await sendAuthLink(input)
    assert.deepEqual(first, { ok: false, reason: "timeout", message: emailStatus(first).message, status: 504 })
    fail = false
    assert.equal((await sendAuthLink(input)).ok, true)
    assert.equal(sent.length, 2)
    assert.equal(sent[1].subject, "Convite para Silva Advogados na Íntegra")
  })

  it("erro ao gerar o link vira resultado, sem enviar nada", async () => {
    const sent = fakeTransport()
    const result = await sendAuthLink({
      to: "cid@exemplo.com",
      kind: "recovery",
      createLink: async () => Promise.reject(new Error("User not found")),
    })
    assert.equal(!result.ok && result.reason, "unexpected")
    assert.equal(sent.length, 0)
  })

  it("destinatário inválido não gera link", async () => {
    let called = false
    const result = await sendAuthLink({ to: "x\n@y", kind: "recovery", createLink: async () => ((called = true), "u") })
    assert.equal(!result.ok && result.reason, "invalid_recipient")
    assert.equal(called, false)
  })

  it("a API só repassa { sent, message } ao navegador", () => {
    assert.deepEqual(emailStatus({ ok: true, messageId: "<x>" }), { sent: true })
    assert.deepEqual(Object.keys(emailStatus({ ok: false, reason: "auth", message: "m", status: 503 })), ["sent", "message"])
  })
})
