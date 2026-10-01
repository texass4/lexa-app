import { renderAuthEmail, type AuthEmailKind } from "./email-templates"

/**
 * Templates do Supabase Auth (painel › Authentication › Emails), gerados a partir de
 * `email-templates.ts` para terem o mesmo desenho dos e-mails enviados pela Íntegra.
 * Os links usam o `token_hash` e passam por `/auth/confirm`, que cria a sessão no
 * servidor — `{{ .SiteURL }}` e `{{ .TokenHash }}` são preenchidos pelo Supabase.
 *
 * Para regenerar `supabase/templates/`: `npm run email:templates`.
 */

const link = (type: string) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`

export const SUPABASE_TEMPLATES: { file: string; panel: string; kind: AuthEmailKind; type: string }[] = [
  { file: "confirmation.html", panel: "Confirm signup", kind: "confirmation", type: "email" },
  { file: "invite.html", panel: "Invite user", kind: "invite", type: "invite" },
  { file: "recovery.html", panel: "Reset password", kind: "recovery", type: "recovery" },
]

export function renderSupabaseTemplate(kind: AuthEmailKind, type: string) {
  return renderAuthEmail(kind, { url: link(type) })
}
