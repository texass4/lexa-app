import Link from "next/link"
import { REF_ICON } from "@/components/shell/ref-icons"
import type { Ref } from "@/lib/domain/refs"
import { backlinks } from "@/lib/services/refs"

/** "Mencionado em": páginas, diário e quadros que referenciam este registro. */
export async function Backlinks({ target, title = "Mencionado em" }: { target: Ref; title?: string }) {
  const items = await backlinks(target)
  return (
    <section aria-label={title}>
      <h2 className="eyebrow mb-2">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-4">Nenhuma página, entrada do diário ou quadro cita este registro ainda. Use @ no editor ou vincule pelo canvas.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((b) => {
            const Icon = REF_ICON[b.type]
            return (
              <li key={`${b.type}:${b.id}`}>
                <Link href={b.href} className="flex items-center gap-2 rounded-sm py-1 text-sm text-ink-2 hover:text-ink hover:underline">
                  <Icon className="size-3.5 text-ink-4" />
                  <span className="truncate">{b.title}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
