/**
 * Serviço de e-mail da Íntegra (somente servidor). O resto do sistema importa daqui e
 * não conhece o Nodemailer nem o provedor SMTP.
 *
 *   Route Handler / Server Action → sendEmail → Nodemailer → SMTP → destinatário
 */

export {
  sendEmail,
  verifyEmailConnection,
  maskEmail,
  validRecipient,
  type SendEmailOptions,
  type SendEmailResult,
  type EmailConnectionCheck,
} from "./email-service"
export { getEmailConfig, isEmailConfigured, emailConfigProblem, missingEmailEnv, type EmailConfig } from "./config"
export { EmailError, type EmailFailureReason } from "./errors"
export * from "./templates"
