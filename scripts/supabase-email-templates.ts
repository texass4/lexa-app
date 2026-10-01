/**
 * Gera `supabase/templates/*.html` (corpo) e `supabase/templates/subjects.json`
 * (assuntos) para colar no painel do Supabase. Rode com `npm run email:templates`.
 */
import { writeFileSync } from "node:fs"
import path from "node:path"
import { renderSupabaseTemplate, SUPABASE_TEMPLATES } from "../lib/auth/supabase-templates"

const dir = path.join(process.cwd(), "supabase", "templates")
const subjects: Record<string, string> = {}

for (const { file, panel, kind, type } of SUPABASE_TEMPLATES) {
  const { subject, html } = renderSupabaseTemplate(kind, type)
  writeFileSync(path.join(dir, file), html)
  subjects[panel] = subject
  console.info(`supabase/templates/${file} — ${panel}: "${subject}"`)
}
writeFileSync(path.join(dir, "subjects.json"), `${JSON.stringify(subjects, null, 2)}\n`)
