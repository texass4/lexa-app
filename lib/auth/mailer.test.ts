import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"

import { renderAuthEmail } from "./email-templates"
import { emailStatus, getMailerConfig, maskEmail, missingMailerEnv, sendAuthLink, sendEmail, setTestTransporter, validRecipient } from "./mailer"
import { renderSupabaseTemplate, SUPABASE_TEMPLATES } from "./supabase-templates"

const ENV = {
  BREVO_SMTP_HOST: "smtp.exemplo.test",
  BREVO_SMTP_USER: "usuario",
  BREVO_SMTP_PASSWORD: "segredo-smtp",
  BREVO_SENDER_EMAIL: "Nao-Responda@Exemplo.test",
}

type Sent = { from: unknown; to: string; subject: string; html: string; text: string }

/** Transporte falso: registra as mensagens e responde com o que cada teste pedir. */
function fakeTransport(reply: (message: Sent, call: number) => unknown = (m) => ({ messageId: "<id@test>", accepted: [m.to], rejected: [] })) {
  const sent: Sent[] = []
  setTestTransporter({
    sendMail: (async (message: Sent) => {
      sent.push(message)
      const result = reply(message, sent.length)
      if (result instanceof Error) throw result
      return result
    }) as never,
  })
  return sent
}

const smtpError = (props: Record<string, unknown>) => Object.assign(new Error("smtp"), props)

describe("configuração do SMTP", () => {
  it("sem as variáveis obrigatórias não configura e diz quais faltam (nunca valores)", () => {
    assert.equal(getMailerConfig({}), null)
    assert.deepEqual(missingMailerEnv({ BREVO_SMTP_HOST: "h" }), ["BREVO_SMTP_USER", "BREVO_SMTP_PASSWORD", "BREVO_SENDER_EMAIL"])
    assert.deepEqual(missingMailerEnv({ ...ENV, BREVO_SMTP_PASSWORD: "  " }), ["BREVO_SMTP_PASSWORD"])
  })

  it("porta 587 por padrão (STARTTLS) e 465 com TLS direto", () => {
    const config = getMailerConfig(ENV)!
    assert.equal(config.port, 587)
    assert.equal(config.secure, false)
    assert.equal(getMailerConfig({ ...ENV, BREVO_SMTP_PORT: "465" })!.secure, true)
  })

  it("remetente normalizado, nome padrão Íntegra e sem quebras de linha", () => {
    assert.deepEqual(getMailerConfig(ENV)!.from, { name: "Íntegra", address: "nao-responda@exemplo.test" })
    assert.equal(getMailerConfig({ ...ENV, BREVO_SENDER_NAME: "Íntegra\r\nBcc: x@y.z" })!.from.name, "Íntegra Bcc: x@y.z")
  })

  it("porta ou remetente inválidos não configuram", () => {
    assert.equal(getMailerConfig({ ...ENV, BREVO_SMTP_PORT: "abc" }), null)
    assert.equal(getMailerConfig({ ...ENV, BREVO_SMTP_PORT: "70000" }), null)
    assert.equal(getMailerConfig({ ...ENV, BREVO_SENDER_EMAIL: "sem-arroba" }), null)
  })
})

describe("destinatário", () => {
  it("normaliza e recusa listas, quebras de linha e endereços inválidos", () => {
    assert.equal(validRecipient("  Ana@Exemplo.COM "), "ana@exemplo.com")
    assert.equal(validRecipient("ana@exemplo.com\r\nBcc: x@y.z"), null)
    assert.equal(validRecipient("ana@exemplo.com, bia@exemplo.com"), null)
    assert.equal(validRecipient("Ana <ana@exemplo.com>"), null)
    assert.equal(validRecipient("ana"), null)
    assert.equal(validRecipient(`${"a".repeat(250)}@x.com`), null)
  })

  it("mascara o e-mail nos logs", () => {
    assert.equal(maskEmail("ana@exemplo.com"), "a***@exemplo.com")
  })
})

describe("sendEmail", () => {
  const saved = { ...process.env }
  beforeEach(() => Object.assign(process.env, ENV))
  afterEach(() => {
    setTestTransporter(undefined)
    for (const key of Object.keys(ENV)) delete process.env[key]
    Object.assign(process.env, saved)
  })

  it("sem SMTP configurado devolve not_configured, sem lançar", async () => {
    for (const key of Object.keys(ENV)) delete process.env[key]
    const sent = fakeTransport()
    const result = await sendEmail({ to: "ana@exemplo.com", subject: "Oi", html: "<p>Oi</p>" })
    assert.deepEqual(result, { ok: false, reason: "not_configured", message: emailStatus(result).message })
    assert.equal(sent.length, 0)
  })

  it("destinatário inválido não chega ao SMTP", async () => {
    const sent = fakeTransport()
    const result = await sendEmail({ to: "ana@exemplo.com\nBcc: x@y.z", subject: "Oi", html: "<p>Oi</p>" })
    assert.equal(result.ok, false)
    assert.equal(!result.ok && result.reason, "invalid_recipient")
    assert.equal(sent.length, 0)
  })

  it("envia com remetente da configuração, assunto em uma linha e texto derivado do HTML", async () => {
    const sent = fakeTransport()
    const result = await sendEmail({ to: "Ana@Exemplo.com", subject: "Linha 1\r\nBcc: x@y.z", html: "<p>Olá &amp; até já</p><p>Fim</p>" })
    assert.deepEqual(result, { ok: true, messageId: "<id@test>" })
    assert.equal(sent[0].to, "ana@exemplo.com")
    assert.equal(sent[0].subject, "Linha 1 Bcc: x@y.z")
    assert.deepEqual(sent[0].from, { name: "Íntegra", address: "nao-responda@exemplo.test" })
    assert.equal(sent[0].text, "Olá & até já\n\nFim")
  })

  it("mesma dedupeKey em sequência: um envio só", async () => {
    const sent = fakeTransport()
    const message = { to: "ana@exemplo.com", subject: "Oi", html: "<p>Oi</p>", dedupeKey: "k" }
    const [a, b] = await Promise.all([sendEmail(message), sendEmail(message)])
    const c = await sendEmail(message)
    assert.equal(sent.length, 1)
    assert.equal(a.ok && !a.duplicate, true)
    assert.equal(b.ok && b.duplicate, true)
    assert.equal(c.ok && c.duplicate, true)
  })

  it("falha temporária (4xx) tenta de novo uma vez", async () => {
    const sent = fakeTransport((m, call) =>
      call === 1 ? smtpError({ responseCode: 421, code: "EENVELOPE" }) : { messageId: "<2>", accepted: [m.to] },
    )
    const result = await sendEmail({ to: "ana@exemplo.com", subject: "Oi", html: "<p>Oi</p>" })
    assert.equal(result.ok, true)
    assert.equal(sent.length, 2)
  })

  it("login recusado, timeout e destinatário recusado não repetem e não expõem detalhe técnico", async () => {
    const cases = [
      [smtpError({ code: "EAUTH", responseCode: 535, response: "535 Authentication failed" }), "auth"],
      [smtpError({ code: "EENVELOPE", responseCode: 550, command: "MAIL FROM" }), "auth"],
      [smtpError({ code: "ETIMEDOUT" }), "timeout"],
      [smtpError({ code: "EENVELOPE", responseCode: 550, command: "RCPT TO" }), "rejected"],
      [new Error("???"), "unexpected"],
    ] as const
    for (const [error, reason] of cases) {
      const sent = fakeTransport(() => error)
      const result = await sendEmail({ to: "ana@exemplo.com", subject: "Oi", html: "<p>Oi</p>" })
      assert.equal(!result.ok && result.reason, reason)
      assert.equal(sent.length, 1)
      const status = emailStatus(result)
      assert.equal(status.sent, false)
      assert.doesNotMatch(status.message ?? "", /535|EAUTH|smtp|segredo/i)
    }
  })

  it("servidor que não aceita o destinatário conta como recusa", async () => {
    fakeTransport(() => ({ messageId: "<x>", accepted: [], rejected: ["ana@exemplo.com"] }))
    const result = await sendEmail({ to: "ana@exemplo.com", subject: "Oi", html: "<p>Oi</p>" })
    assert.equal(!result.ok && result.reason, "rejected")
  })
})

describe("sendAuthLink", () => {
  const saved = { ...process.env }
  beforeEach(() => Object.assign(process.env, ENV))
  afterEach(() => {
    setTestTransporter(undefined)
    for (const key of Object.keys(ENV)) delete process.env[key]
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
    assert.match(sent[0].html, /token_hash=t1/)
    assert.equal(sent[0].subject, "Redefinir sua senha na Íntegra")
  })

  it("falha libera a chave: dá para tentar de novo na hora", async () => {
    let fail = true
    const sent = fakeTransport((m) => (fail ? smtpError({ code: "ETIMEDOUT" }) : { messageId: "<ok>", accepted: [m.to] }))
    const input = { to: "bia@exemplo.com", kind: "invite" as const, createLink: async () => "https://app.test/l" }
    assert.equal((await sendAuthLink(input)).ok, false)
    fail = false
    assert.equal((await sendAuthLink(input)).ok, true)
    assert.equal(sent.length, 2)
  })

  it("erro ao gerar o link vira resultado, não exceção", async () => {
    fakeTransport()
    const result = await sendAuthLink({
      to: "cid@exemplo.com",
      kind: "recovery",
      createLink: async () => Promise.reject(new Error("User not found")),
    })
    assert.equal(!result.ok && result.reason, "unexpected")
  })
})

describe("templates", () => {
  it("escapam nome e escritório e trazem o link no HTML e no texto", () => {
    const email = renderAuthEmail("invite", { url: "https://app.test/a?x=1&y=2", name: "<b>Ana</b>", organizationName: 'Silva & "Souza"' })
    assert.equal(email.subject, 'Convite para Silva & "Souza" na Íntegra')
    assert.match(email.html, /&lt;b&gt;Ana&lt;\/b&gt;/)
    assert.match(email.html, /Silva &amp; &quot;Souza&quot;/)
    assert.match(email.html, /href="https:\/\/app\.test\/a\?x=1&amp;y=2"/)
    assert.doesNotMatch(email.html, /<b>Ana/)
    assert.match(email.text, /https:\/\/app\.test\/a\?x=1&y=2/)
  })

  it("assuntos dos três e-mails", () => {
    assert.equal(renderAuthEmail("invite", { url: "u" }).subject, "Você foi convidado para a Íntegra")
    assert.equal(renderAuthEmail("recovery", { url: "u" }).subject, "Redefinir sua senha na Íntegra")
    assert.equal(renderAuthEmail("confirmation", { url: "u" }).subject, "Confirme seu e-mail na Íntegra")
  })

  it("supabase/templates está em dia com email-templates.ts (rode `npm run email:templates`)", () => {
    const dir = path.join(import.meta.dirname, "..", "..", "supabase", "templates")
    const subjects = JSON.parse(readFileSync(path.join(dir, "subjects.json"), "utf8"))
    for (const { file, panel, kind, type } of SUPABASE_TEMPLATES) {
      const { subject, html } = renderSupabaseTemplate(kind, type)
      assert.equal(readFileSync(path.join(dir, file), "utf8"), html, file)
      assert.equal(subjects[panel], subject)
      assert.match(html, new RegExp(`/auth/confirm\\?token_hash=\\{\\{ \\.TokenHash \\}\\}&amp;type=${type}"`))
    }
  })
})
