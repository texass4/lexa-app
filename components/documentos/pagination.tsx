"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "cn"
import type { MoreFromServer } from "@/components/ui/show-more"
import { PAGE_SIZE, pageNumbers } from "@/lib/documentos/pagination"

/**
 * Lista em páginas (como no rodapé "1–10 de 24 itens"). O que já está na memória é
 * mostrado na hora; quando a página pedida passa do que foi carregado, a próxima parte
 * vem do banco (`server`). `total` é o tamanho real, quando se sabe.
 */
export function Paginated<T>({
  items,
  listKey,
  server,
  total,
  pageSize = PAGE_SIZE,
  children,
}: {
  items: T[]
  listKey: string
  server?: MoreFromServer
  total?: number
  pageSize?: number
  children: (visible: T[]) => React.ReactNode
}) {
  const [page, setPage] = React.useState(1)
  const [seen, setSeen] = React.useState(listKey)
  if (seen !== listKey) {
    setSeen(listKey)
    setPage(1)
  }
  const more = !!server && !server.done
  const known = total ?? (more ? undefined : items.length)
  const pages = Math.max(1, Math.ceil((known ?? items.length) / pageSize) + (known === undefined && more ? 1 : 0))
  const current = Math.min(page, pages)
  const start = (current - 1) * pageSize
  const visible = items.slice(start, start + pageSize)

  // A página pedida ainda não chegou toda: busca a próxima parte no banco.
  const needsMore = more && !server!.loading && items.length < start + pageSize
  React.useEffect(() => {
    if (needsMore) server?.more()
  }, [needsMore, server])

  const last = start + visible.length
  const go = (p: number) => {
    setPage(Math.max(1, Math.min(p, pages)))
  }
  const btn =
    "flex h-8 min-w-8 items-center justify-center rounded-[8px] px-2 text-[12.5px] tabular-nums outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-40"

  return (
    <>
      {children(visible)}
      {(pages > 1 || items.length > 0) && (
        <nav aria-label="Páginas da lista" className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-3">
          <p className="text-[12.5px] text-muted-foreground" aria-live="polite">
            {visible.length ? `${start + 1}–${last}` : "0"} de {known !== undefined ? known : `${items.length}+`} ite
            {(known ?? items.length) === 1 ? "m" : "ns"}
            {server?.loading && (
              <Loader2 className="ml-2 inline size-3.5 animate-spin align-[-2px] motion-reduce:animate-none" aria-label="Carregando" />
            )}
          </p>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={cn(btn, "text-muted-foreground hover:bg-accent hover:text-foreground")}
                onClick={() => go(current - 1)}
                disabled={current === 1}
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </button>
              {pageNumbers(current, pages).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="px-1 text-[12.5px] text-subtle" aria-hidden>
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => go(p)}
                    aria-current={p === current ? "page" : undefined}
                    aria-label={`Página ${p}`}
                    className={cn(
                      btn,
                      p === current
                        ? "bg-brand font-semibold text-brand-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                className={cn(btn, "text-muted-foreground hover:bg-accent hover:text-foreground")}
                onClick={() => go(current + 1)}
                disabled={current === pages}
                aria-label="Próxima página"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </nav>
      )}
    </>
  )
}
