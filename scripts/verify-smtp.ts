/**
 * Teste da configuração SMTP, só pelo terminal (nunca por rota pública):
 *
 *   npm run email:verify                         # configurado? conecta? autentica?
 *   npm run email:verify -- --send-to=voce@x.com  # e envia um e-mail de teste
 *
 * Lê o `.env.local` (para a Vercel: `vercel env pull .env.local` antes). Mostra host,
 * porta e remetente; nunca a senha.
 */
import { getEmailConfig, maskEmail, sendEmail, verifyEmailConnection } from "../lib/services/email"

const sendTo = process.argv.find((arg) => arg.startsWith("--send-to="))?.slice("--send-to=".length)

const check = await verifyEmailConnection()
if (!check.configured) {
  console.error(`✗ SMTP não configurado: ${check.problem}. Preencha as variáveis SMTP_* no .env.local.`)
  process.exit(1)
}

const config = getEmailConfig()!
console.info(
  `✓ Configurado: ${config.host}:${config.port} (${config.secure ? "TLS direto" : "STARTTLS"}), usuário ${maskEmail(config.user)}, remetente "${config.from.name}" <${config.from.address}>`,
)
console.info(
  check.connected
    ? "✓ Conexão com o servidor SMTP"
    : `✗ Sem conexão com o servidor SMTP (${check.reason}): confira SMTP_HOST, SMTP_PORT e SMTP_SECURE (true só para TLS direto, normalmente porta 465)`,
)
console.info(
  check.authenticated
    ? "✓ Autenticação"
    : check.connected
      ? "✗ Autenticação recusada: confira SMTP_USER e SMTP_PASSWORD"
      : "· Autenticação não testada",
)
if (check.detail?.code || check.detail?.response) console.info("  Detalhe do servidor:", check.detail)
if (!check.authenticated) process.exit(1)

if (sendTo) {
  try {
    const { messageId } = await sendEmail({
      to: sendTo,
      subject: "Teste de e-mail da Íntegra",
      html: "<p>Este é um e-mail de teste da Íntegra. Se ele chegou, o SMTP está funcionando.</p>",
    })
    console.info(`✓ E-mail de teste enviado para ${maskEmail(sendTo)} (${messageId})`)
  } catch (error) {
    console.error(`✗ Envio de teste falhou: ${(error as Error).message} (detalhes no log acima)`)
    process.exit(1)
  }
}
