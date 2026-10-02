import { setEmailTransportForTests } from "./email-service"

/** Apoio aos testes do e-mail (não é usado pela aplicação). */

export const SMTP_ENV = {
  SMTP_HOST: "smtp.exemplo.test",
  SMTP_USER: "usuario",
  SMTP_PASSWORD: "segredo-smtp",
  SMTP_FROM_EMAIL: "Nao-Responda@Exemplo.test",
}

type Sent = { from: unknown; to: string[]; subject: string; html: string; text: string }

/** Transporte falso: registra as mensagens e responde com o que cada teste pedir. */
export function fakeTransport(
  reply: (message: Sent, call: number) => unknown = (m) => ({ messageId: "<id@test>", accepted: m.to, rejected: [] }),
  verify: () => unknown = () => true,
) {
  const sent: Sent[] = []
  setEmailTransportForTests({
    sendMail: (async (message: Sent) => {
      sent.push(message)
      const result = reply(message, sent.length)
      if (result instanceof Error) throw result
      return result
    }) as never,
    verify: (async () => {
      const result = verify()
      if (result instanceof Error) throw result
      return result
    }) as never,
  })
  return sent
}

export const smtpError = (props: Record<string, unknown>) => Object.assign(new Error("smtp"), props)
