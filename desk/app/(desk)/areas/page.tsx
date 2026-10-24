import { AreaRow, NewAreaForm } from "@/components/areas/area-list"
import { Page, PageHeader, SectionTitle } from "@/components/layout/page"
import { EmptyState } from "@/components/ui/empty"
import { listAreas } from "@/lib/services/areas"

export const metadata = { title: "Áreas" }

export default async function AreasPage() {
  const all = await listAreas({ includeArchived: true })
  const active = all.filter((a) => !a.archivedAt)
  const archived = all.filter((a) => a.archivedAt)
  return (
    <Page>
      <PageHeader eyebrow="Áreas da vida" title="Áreas" description="Dimensões permanentes — estudos, trabalho, saúde, música, vida pessoal. Não terminam como projetos; organizam tudo o que vive nelas." />
      <NewAreaForm />
      <div className="mt-8">
        {active.length === 0 ? (
          <EmptyState title="Nenhuma área ainda">Crie as áreas que fazem sentido para você. Nada vem pronto.</EmptyState>
        ) : (
          <ul className="border-t border-line-soft">
            {active.map((a, i) => (
              <AreaRow key={a.id} area={a} first={i === 0} last={i === active.length - 1} />
            ))}
          </ul>
        )}
      </div>
      {archived.length ? (
        <section className="mt-12">
          <SectionTitle title="Arquivadas" count={archived.length} />
          <ul>
            {archived.map((a) => (
              <AreaRow key={a.id} area={a} first last />
            ))}
          </ul>
        </section>
      ) : null}
    </Page>
  )
}
