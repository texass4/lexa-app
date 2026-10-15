"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronRight, FileText, Home, Loader2, Lock, Plus, Search, Star, UsersRound, X } from "lucide-react"
import { cn } from "cn"
import { usePages, searchPages } from "@/lib/paginas/pages"
import { buildTree, pageHref, pageTitle, type PageMeta, type PageTreeNode } from "@/lib/paginas/model"
import { createLocalStore } from "@/lib/core/hooks"
import { fmtRelative } from "@/lib/core/dates"
import { useNewPage } from "./new-page-dialog"

const openStore = createLocalStore("lexa:paginas:abertas", "")

/** Páginas expandidas na árvore (por pessoa, neste navegador — só conveniência de tela). */
function useExpanded() {
  const raw = React.useSyncExternalStore(openStore.subscribe, openStore.get, openStore.getServer)
  const set = React.useMemo(() => new Set(raw.split(",").filter(Boolean)), [raw])
  const toggle = (id: string, open?: boolean) => {
    const next = new Set(set)
    if (open ?? !next.has(id)) next.add(id)
    else next.delete(id)
    openStore.set([...next].slice(-200).join(","))
  }
  return { isOpen: (id: string) => set.has(id), toggle }
}

const row =
  "group/row flex h-8 min-w-0 items-center gap-1 rounded-[8px] pr-1 text-[13px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-within:ring-2 focus-within:ring-brand/30"

function TreeItem({
  node,
  depth,
  activeId,
  expanded,
}: {
  node: PageTreeNode
  depth: number
  activeId?: string
  expanded: { isOpen: (id: string) => boolean; toggle: (id: string, open?: boolean) => void }
}) {
  const newPage = useNewPage()
  const { page, children } = node
  const open = expanded.isOpen(page.id)
  const active = page.id === activeId
  return (
    <li>
      <div
        className={cn(row, active && "bg-brand-soft/70 font-medium text-brand-strong hover:bg-brand-soft hover:text-brand-strong")}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          onClick={() => expanded.toggle(page.id)}
          aria-label={open ? `Recolher ${pageTitle(page)}` : `Expandir ${pageTitle(page)}`}
          aria-expanded={children.length ? open : undefined}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-subtle hover:bg-surface-muted",
            !children.length && "invisible",
          )}
        >
          <ChevronRight className={cn("size-3.5 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
        </button>
        <Link
          href={pageHref(page.id)}
          aria-current={active ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 outline-none"
        >
          <FileText className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{pageTitle(page)}</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            expanded.toggle(page.id, true)
            newPage.open({ parent: page })
          }}
          aria-label={`Nova subpágina em ${pageTitle(page)}`}
          title="Nova subpágina"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-subtle opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 hover:bg-surface-muted hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {open && children.length > 0 && (
        <ul>
          {children.map((c) => (
            <TreeItem key={c.page.id} node={c} depth={depth + 1} activeId={activeId} expanded={expanded} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Section({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
        <span className="[&_svg]:size-3.5">{icon}</span>
        <span className="flex-1">{title}</span>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Busca no banco (título e texto), com espera curta entre teclas. */
function useSearch(query: string) {
  const [result, setResult] = React.useState<{ query: string; pages: PageMeta[] | null } | null>(null)
  React.useEffect(() => {
    const q = query.trim()
    if (!q) return
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const pages = await searchPages(q)
      if (!cancelled) setResult({ query: q, pages })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [query])
  const q = query.trim()
  if (!q) return { state: "idle" as const }
  if (!result || result.query !== q) return { state: "loading" as const }
  return result.pages ? { state: "done" as const, pages: result.pages } : { state: "error" as const }
}

/**
 * Navegação das Páginas: início, busca, favoritos e a árvore (pessoais e do escritório).
 * A mesma navegação aparece na coluna da esquerda (telas largas) e numa gaveta (celular).
 */
export function PagesNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { status, list, pages, favorites, reload } = usePages()
  const newPage = useNewPage()
  const expanded = useExpanded()
  const [query, setQuery] = React.useState("")
  const search = useSearch(query)
  const activeId = pathname.startsWith("/tarefas/paginas/") ? pathname.split("/")[3] : undefined

  // A árvore fica aberta até a página aberta (sem gravar nada).
  const ancestors = React.useMemo(() => {
    const out = new Set<string>()
    let p = activeId ? pages.get(activeId) : undefined
    while (p?.parentId && !out.has(p.parentId)) {
      out.add(p.parentId)
      p = pages.get(p.parentId)
    }
    return out
  }, [activeId, pages])
  const tree = React.useMemo(
    () => ({ isOpen: (id: string) => ancestors.has(id) || expanded.isOpen(id), toggle: expanded.toggle }),
    [ancestors, expanded],
  )

  const personal = React.useMemo(() => buildTree(list.filter((p) => p.visibility === "private")), [list])
  const office = React.useMemo(() => buildTree(list.filter((p) => p.visibility === "office")), [list])
  const favoritePages = list.filter((p) => favorites.has(p.id)).sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), "pt-BR"))

  return (
    <nav aria-label="Páginas" className="flex h-full min-h-0 flex-col" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <div className="space-y-2 px-1">
        <div role="search" className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Buscar páginas"
            aria-label="Buscar páginas por título ou texto"
            className="h-8 w-full rounded-[8px] border border-border bg-surface pr-7 pl-8 text-[13px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus:border-brand/60 focus:ring-4 focus:ring-brand/10 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-subtle hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => newPage.open({})}
          className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-[13px] font-medium text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Plus className="size-4 text-brand" /> Nova página
        </button>
        <Link
          href="/tarefas/paginas"
          aria-current={pathname === "/tarefas/paginas" ? "page" : undefined}
          className={cn(
            "flex h-8 items-center gap-2 rounded-[8px] px-2 text-[13px] outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40",
            pathname === "/tarefas/paginas" ? "bg-brand-soft/70 font-medium text-brand-strong" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Home className="size-4" /> Início das páginas
        </Link>
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-1 pb-4 thin-scrollbar">
        {query.trim() ? (
          <Section title="Resultados" icon={<Search />}>
            <div aria-live="polite">
              {search.state === "loading" && (
                <p className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> Buscando…
                </p>
              )}
              {search.state === "error" && <p className="px-2 py-1.5 text-[12.5px] text-danger">Não foi possível buscar. Verifique a conexão.</p>}
              {search.state === "done" && !search.pages.length && (
                <p className="px-2 py-1.5 text-[12.5px] text-muted-foreground">Nenhuma página com “{query.trim()}”.</p>
              )}
              {search.state === "done" && search.pages.length > 0 && (
                <ul className="space-y-0.5">
                  {search.pages.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          router.push(pageHref(p.id))
                          onNavigate?.()
                        }}
                        className="flex w-full min-w-0 flex-col rounded-[8px] px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40"
                      >
                        <span className="truncate text-[13px] text-foreground">{pageTitle(p)}</span>
                        <span className="text-[11.5px] text-muted-foreground">
                          {p.visibility === "private" ? "Pessoal" : "Escritório"} · editada {fmtRelative(p.updatedAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        ) : status === "loading" ? (
          <div className="mt-4 space-y-2 px-2" aria-busy="true" aria-label="Carregando páginas">
            {[70, 55, 80, 60].map((w) => (
              <div key={w} className="h-4 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : status === "unavailable" ? (
          <p className="mt-4 px-2 text-[12.5px] text-muted-foreground">As páginas ainda não estão ativas neste escritório.</p>
        ) : status === "error" ? (
          <div className="mt-4 px-2 text-[12.5px] text-danger">
            Não foi possível carregar as páginas.{" "}
            <button type="button" onClick={() => void reload()} className="font-medium underline">
              Tentar de novo
            </button>
          </div>
        ) : (
          <>
            {favoritePages.length > 0 && (
              <Section title="Favoritas" icon={<Star />}>
                <ul className="space-y-0.5">
                  {favoritePages.map((p) => (
                    <li key={p.id}>
                      <Link href={pageHref(p.id)} className={cn(row, "pl-2", p.id === activeId && "bg-brand-soft/70 font-medium text-brand-strong")}>
                        <Star className="size-3.5 shrink-0 fill-gold text-gold" aria-hidden />
                        <span className="truncate">{pageTitle(p)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section
              title="Pessoais"
              icon={<Lock />}
              action={
                <button
                  type="button"
                  onClick={() => newPage.open({ visibility: "private" })}
                  aria-label="Nova página pessoal"
                  className="rounded p-0.5 hover:bg-accent hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                </button>
              }
            >
              {personal.length ? (
                <ul className="space-y-0.5">
                  {personal.map((n) => (
                    <TreeItem key={n.page.id} node={n} depth={0} activeId={activeId} expanded={tree} />
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-1 text-[12.5px] text-subtle">Só você vê as páginas pessoais.</p>
              )}
            </Section>
            <Section
              title="Escritório"
              icon={<UsersRound />}
              action={
                newPage.canShare && (
                  <button
                    type="button"
                    onClick={() => newPage.open({ visibility: "office" })}
                    aria-label="Nova página do escritório"
                    className="rounded p-0.5 hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                )
              }
            >
              {office.length ? (
                <ul className="space-y-0.5">
                  {office.map((n) => (
                    <TreeItem key={n.page.id} node={n} depth={0} activeId={activeId} expanded={tree} />
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-1 text-[12.5px] text-subtle">Nenhuma página compartilhada ainda.</p>
              )}
            </Section>
          </>
        )}
      </div>
    </nav>
  )
}
