import { renderEmailConfirmationEmail } from "./email-confirmation"
import { renderInvitationEmail } from "./invitation"
import { renderPasswordResetEmail } from "./password-reset"
import type { RenderedEmail } from "./layout"

/**
 * Templates dos e-mails transacionais da Íntegra. Funções puras (sem envio). Também
 * geram os templates do Supabase Auth (`./supabase.ts` → `supabase/templates/`), para
 * que os dois tenham o mesmo desenho.
 */

export { escapeHtml, type RenderedEmail } from "./layout"
export { renderInvitationEmail, type InvitationEmailInput } from "./invitation"
export { renderPasswordResetEmail, type PasswordResetEmailInput } from "./password-reset"
export { renderEmailConfirmationEmail, type EmailConfirmationInput } from "./email-confirmation"
export { renderAccountExistsEmail, type AccountExistsEmailInput } from "./account-exists"

export type AuthEmailKind = "invite" | "recovery" | "confirmation"

export interface AuthEmailInput {
  /** Link de uso único. Também aceita os marcadores do Supabase (`{{ .TokenHash }}`). */
  url: string
  /** Nome de quem recebe, quando conhecido. */
  name?: string
  /** Escritório do convite, quando conhecido. */
  organizationName?: string
}

/** E-mail de autenticação pelo tipo (convite, recuperação ou confirmação). */
export function renderAuthEmail(kind: AuthEmailKind, input: AuthEmailInput): RenderedEmail {
  if (kind === "invite") return renderInvitationEmail(input)
  if (kind === "recovery") return renderPasswordResetEmail(input)
  return renderEmailConfirmationEmail(input)
}
