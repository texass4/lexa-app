import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { renderAuthEmail } from "./email-templates"
import { readMailConfig } from "./mailer"

describe("templates de e-mail", () => {
  it("convite, recuperação e confirmação trazem o link e escapam HTML", () => {
    const url = "https://app.exemplo/auth/confirm?token_hash=abc&next=/redefinir-senha"
    for (const kind of ["invite", "recovery", "confirm"] as const) {
      const message = renderAuthEmail(kind, url)
      assert.ok(message.subject.length > 0)
      assert.ok(message.html.includes(url.replace(/&/g, "&amp;")))
      assert.ok(message.text.includes(url))
      assert.equal(message.html.includes("<script"), false)
    }
    const hostile = renderAuthEmail("invite", `https://app.exemplo/?q="><script>`)
    assert.equal(hostile.html.includes("<script>"), false)
    assert.ok(hostile.html.includes("&quot;&gt;&lt;script&gt;"))
  })
})

describe("configuração SMTP", () => {
  it("sem remetente ou senha, o envio fica desligado", () => {
    const previous = {
      user: process.env.BREVO_SMTP_USER,
      password: process.env.BREVO_SMTP_PASSWORD,
      sender: process.env.BREVO_SENDER_EMAIL,
    }
    delete process.env.BREVO_SMTP_USER
    delete process.env.BREVO_SMTP_PASSWORD
    delete process.env.BREVO_SENDER_EMAIL
    assert.equal(readMailConfig(), null)
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    restore("BREVO_SMTP_USER", previous.user)
    restore("BREVO_SMTP_PASSWORD", previous.password)
    restore("BREVO_SENDER_EMAIL", previous.sender)
  })
})
