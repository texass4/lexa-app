import { Download, LogOut } from "lucide-react"
import { logoutAction } from "@/app/actions/auth"
import { Page, PageHeader, SectionTitle } from "@/components/layout/page"
import { PreferencesForm, TagManager } from "@/components/settings/settings-form"
import { buttonClass } from "@/components/ui/button"
import { getRequestContext } from "@/lib/context"
import { getSettings } from "@/lib/services/settings"
import { listTags } from "@/lib/services/tasks"

export const metadata = { title: "Configurações" }

export default async function SettingsPage() {
  const [settings, tags, ctx] = await Promise.all([getSettings(), listTags(), getRequestContext()])
  const database = process.env.DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : "PostgreSQL embutido (PGlite, em disco)"
  return (
    <Page>
      <PageHeader eyebrow="Configurações" title="Configurações" />
      <div className="flex flex-col gap-14">
        <section>
          <SectionTitle title="Preferências" />
          <PreferencesForm initial={settings} browserTimezone={ctx.timezoneSource === "browser" ? ctx.timezone : "não informado"} />
        </section>

        <section>
          <SectionTitle title="Tags" count={tags.length || undefined} />
          <TagManager tags={tags} />
        </section>

        <section>
          <SectionTitle title="Exportar dados" />
          <p className="mb-4 max-w-2xl text-sm text-ink-3">
            Uma cópia completa e legível dos seus dados, para guardar onde quiser. O JSON tem todas as tabelas (tarefas, projetos, áreas, páginas, diário, quadros e caixa de entrada); o Markdown traz
            páginas, diário e tarefas como texto.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export/json" className={buttonClass("secondary")} download>
              <Download /> Exportar tudo (JSON)
            </a>
            <a href="/api/export/markdown" className={buttonClass("secondary")} download>
              <Download /> Exportar textos (Markdown, .zip)
            </a>
          </div>
        </section>

        <section>
          <SectionTitle title="Sistema" />
          <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-ink-4">Banco de dados</dt>
            <dd className="text-ink-2">{database}</dd>
            <dt className="text-ink-4">Fuso em uso</dt>
            <dd className="text-ink-2">
              {ctx.timezone} <span className="text-ink-4">({ctx.timezoneSource === "settings" ? "fixado aqui" : ctx.timezoneSource === "browser" ? "do navegador" : "padrão"})</span>
            </dd>
            <dt className="text-ink-4">Hoje</dt>
            <dd className="meta self-center text-ink-2">{ctx.today}</dd>
          </dl>
          <form action={logoutAction} className="mt-6">
            <button className={buttonClass("secondary")}>
              <LogOut /> Sair desta sessão
            </button>
          </form>
        </section>
      </div>
    </Page>
  )
}
