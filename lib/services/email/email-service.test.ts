import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"

import {
  EmailError,
  emailConfigProblem,
  getEmailConfig,
  maskEmail,
  missingEmailEnv,
  renderAuthEmail,
  sendEmail,
  validRecipient,
  verifyEmailConnection,
} from "./index"
import { setEmailTransportForTests } from "./email-service"
import { fakeTransport, SMTP_ENV, smtpError } from "./testing"
import { renderSupabaseTemplate, SUPABASE_TEMPLATES } from "./templates/supabase"

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof EmailError)
    return error
  }
  assert.fail("deveria ter lançado EmailError")
}

describe("configuração do SMTP", () => {
  it("sem as variáveis obrigatórias não configura e diz quais faltam (nunca valores)", () => {
    assert.equal(getEmailConfig({}), null)
    assert.deepEqual(missingEmailEnv({ SMTP_HOST: "h" }), ["SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL"])
    assert.equal(emailConfigProblem({ ...SMTP_ENV, SMTP_PASSWORD: "  " }), "faltam SMTP_PASSWORD")
    assert.doesNotMatch(emailConfigProblem({ ...SMTP_ENV, SMTP_PORT: "x" }) ?? "", /segredo/)
  })

  it("porta 587 por padrão; SMTP_SECURE explícito vence; sem ele, só a 465 usa TLS direto", () => {
    assert.deepEqual([getEmailConfig(SMTP_ENV)!.port, getEmailConfig(SMTP_ENV)!.secure], [587, false])
    assert.equal(getEmailConfig({ ...SMTP_ENV, SMTP_PORT: "465" })!.secure, true)
    assert.equal(getEmailConfig({ ...SMTP_ENV, SMTP_PORT: "2465", SMTP_SECURE: "true" })!.secure, true)
    assert.equal(getEmailConfig({ ...SMTP_ENV, SMTP_PORT: "465", SMTP_SECURE: "false" })!.secure, false)
    assert.equal(getEmailConfig({ ...SMTP_ENV, SMTP_SECURE: "sim" }), null)
  })

  it("remetente normalizado, nome padrão Íntegra e sem quebras de linha", () => {
    assert.deepEqual(getEmailConfig(SMTP_ENV)!.from, { name: "Íntegra", address: "nao-responda@exemplo.test" })
    assert.equal(getEmailConfig({ ...SMTP_ENV, SMTP_FROM_NAME: "Íntegra\r\nBcc: x@y.z" })!.from.name, "Íntegra Bcc: x@y.z")
  })

  it("porta ou remetente inválidos não configuram", () => {
    assert.equal(getEmailConfig({ ...SMTP_ENV, SMTP_PORT: "abc" }), null)
    assert.equal(getEmailConfig({ ...SMTP_ENV, SMTP_PORT: "70000" }), null)
    assert.equal(getEmailConfig({ ...SMTP_ENV, SMTP_FROM_EMAIL: "sem-arroba" }), null)
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
    assert.equal(maskEmail("usuario"), "u***")
  })
})

describe("sendEmail", () => {
  const saved = { ...process.env }
  beforeEach(() => Object.assign(process.env, SMTP_ENV))
  afterEach(() => {
    setEmailTransportForTests(undefined)
    for (const key of Object.keys(SMTP_ENV)) delete process.env[key]
    Object.assign(process.env, saved)
  })

  it("sem SMTP configurado lança not_configured, sem tocar no SMTP", async () => {
    for (const key of Object.keys(SMTP_ENV)) delete process.env[key]
    const sent = fakeTransport()
    const error = await rejection(sendEmail({ to: "ana@exemplo.com", subject: "Oi", html: "<p>Oi</p>" }))
    assert.equal(error.reason, "not_configured")
    assert.equal(error.status, 503)
    assert.equal(sent.length, 0)
  })

  it("destinatário inválido (ou um da lista) não chega ao SMTP", async () => {
    const sent = fakeTransport()
    for (const to of ["ana@exemplo.com\nBcc: x@y.z", ["ana@exemplo.com", "nao-e-email"], []]) {
      assert.equal((await rejection(sendEmail({ to, subject: "Oi", html: "<p>Oi</p>" }))).reason, "invalid_recipient")
    }
    assert.equal(sent.length, 0)
  })

  it("envia com o remetente da configuração, assunto em uma linha e texto derivado do HTML", async () => {
    const sent = fakeTransport()
    const result = await sendEmail({ to: "Ana@Exemplo.com", subject: "Linha 1\r\nBcc: x@y.z", html: "<p>Olá &amp; até já</p><p>Fim</p>" })
    assert.deepEqual(result, { messageId: "<id@test>", accepted: ["ana@exemplo.com"], rejected: [] })
    assert.deepEqual(sent[0].to, ["ana@exemplo.com"])
    assert.equal(sent[0].subject, "Linha 1 Bcc: x@y.z")
    assert.deepEqual(sent[0].from, { name: "Íntegra", address: "nao-responda@exemplo.test" })
    assert.equal(sent[0].text, "Olá & até já\n\nFim")
  })

  it("vários destinatários (sem repetição) e envio parcial informado no retorno", async () => {
    const sent = fakeTransport(() => ({ messageId: "<m>", accepted: ["ana@exemplo.com"], rejected: ["bia@exemplo.com"] }))
    const result = await sendEmail({ to: ["ana@exemplo.com", "BIA@exemplo.com", "ana@exemplo.com"], subject: "Oi", html: "<p>Oi</p>" })
    assert.deepEqual(sent[0].to, ["ana@exemplo.com", "bia@exemplo.com"])
    assert.deepEqual(result.rejected, ["bia@exemplo.com"])
  })

  it("falha temporária (4xx) tenta de novo uma vez", async () => {
    const sent = fakeTransport((m, call) => (call === 1 ? smtpError({ responseCode: 421, code: "EENVELOPE" }) : { messageId: "<2>", accepted: m.to }))
    await sendEmail({ to: "ana@exemplo.com", subject: "Oi", html: "<p>Oi</p>" })
    assert.equal(sent.length, 2)
  })

  it("login recusado, timeout e destinatário recusado não repetem e não expõem detalhe técnico", async () => {
    const cases = [
      [smtpError({ code: "EAUTH", responseCode: 535, response: "535 Authentication failed" }), "auth"],
      [smtpError({ code: "EENVELOPE", responseCode: 550, command: "MAIL FROM" }), "auth"],
      [smtpError({ code: "ETIMEDOUT" }), "timeout"],
      [smtpError({ code: "EENVELOPE", responseCode: 550, command: "RCPT TO" }), "rejected"],
      [{ messageId: "<x>", accepted: [], rejected: ["ana@exemplo.com"] }, "rejected"],
      [new Error("???"), "unexpected"],
    ] as const
    for (const [reply, reason] of cases) {
      const sent = fakeTransport(() => reply)
      const error = await rejection(sendEmail({ to: "ana@exemplo.com", subject: "Oi", html: "<p>Oi</p>" }))
      assert.equal(error.reason, reason)
      assert.equal(sent.length, 1)
      assert.doesNotMatch(error.message, /535|EAUTH|smtp|segredo|usuario/i)
    }
  })
})

describe("verifyEmailConnection", () => {
  const saved = { ...process.env }
  afterEach(() => {
    setEmailTransportForTests(undefined)
    for (const key of Object.keys(SMTP_ENV)) delete process.env[key]
    Object.assign(process.env, saved)
  })

  it("configurado → conecta → autentica, sem expor credenciais", async () => {
    for (const key of Object.keys(SMTP_ENV)) delete process.env[key]
    assert.deepEqual(await verifyEmailConnection(), { configured: false, problem: "faltam SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL" })

    Object.assign(process.env, SMTP_ENV)
    fakeTransport(undefined, () => true)
    assert.deepEqual(await verifyEmailConnection(), { configured: true, connected: true, authenticated: true })

    fakeTransport(undefined, () => smtpError({ code: "EAUTH", responseCode: 535 }))
    const auth = await verifyEmailConnection()
    assert.equal(auth.configured && auth.connected && !auth.authenticated, true)

    fakeTransport(undefined, () => smtpError({ code: "ECONNECTION" }))
    const down = await verifyEmailConnection()
    assert.equal(down.configured && !down.connected, true)
    assert.doesNotMatch(JSON.stringify(down), /segredo|usuario/)
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

  it("supabase/templates está em dia com os templates (rode `npm run email:templates`)", () => {
    const dir = path.join(import.meta.dirname, "..", "..", "..", "supabase", "templates")
    const subjects = JSON.parse(readFileSync(path.join(dir, "subjects.json"), "utf8"))
    for (const { file, panel, kind, type } of SUPABASE_TEMPLATES) {
      const { subject, html } = renderSupabaseTemplate(kind, type)
      assert.equal(readFileSync(path.join(dir, file), "utf8"), html, file)
      assert.equal(subjects[panel], subject)
      assert.match(html, new RegExp(`/auth/confirm\\?token_hash=\\{\\{ \\.TokenHash \\}\\}&amp;type=${type}"`))
    }
  })
})
