"use client"

import * as React from "react"
import Link from "next/link"
import {
  CalendarRange,
  ChevronRight,
  ClipboardList,
  FileText,
  Lightbulb,
  ListChecks,
  Lock,
  Plus,
  Scale,
  Star,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Panel } from "@/components/ui/panel"
import { usePages } from "@/lib/paginas/pages"
import { breadcrumb, pageHref, pageTitle, type PageMeta } from "@/lib/paginas/model"
import { PAGE_TEMPLATES, type TemplateKey } from "@/lib/paginas/templates"
import { getUser } from "@/lib/auth/account"
import { fmtRelative } from "@/lib/core/dates"
import { useNewPage } from "./new-page-dialog"
import { NavToggle } from "./pages-shell"

const ICON: Record<TemplateKey, LucideIcon> = {
  branco: FileText,
  reuniao: UsersRound,
  semana: CalendarRange,
  projeto: ClipboardList,
  caso: Scale,
  procedimento: ListChecks,
  ideias: Lightbulb,
}

function PageRow({ page, pages }: { page: PageMeta; pages: ReadonlyMap<string, PageMeta> }) {
  const path = breadcrumb(pages, page.id).slice(0, -1)
  const editor = page.updatedBy ? getUser(page.updatedBy) : getUser(page.createdBy)
  return (
    <li>
      <Link
        href={pageHref(page.id)}
        className="group flex min-w-0 items-center gap-3 rounded-[10px] px-3 py-2.5 outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-foreground">{pageTitle(page)}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            {page.visibility === "private" ? (
              <Lock className="size-3 shrink-0" aria-label="Pessoal" />
            ) : (
              <UsersRound className="size-3 shrink-0" aria-label="Escritório" />
            )}
            {path.length > 0 && <span className="truncate">{path.map(pageTitle).join(" › ")} ·</span>}
            <span className="shrink-0">
              editada {fmtRelative(page.updatedAt)} por {editor.firstName}
            </span>
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </Link>
    </li>
  )
}

/** Início das Páginas: modelos, favoritas e as editadas por último. */
export function PagesHome() {
  const { status, list, pages, favorites, reload } = usePages()
  const newPage = useNewPage()
  const recent = React.useMemo(() => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12), [list])
  const favs = list.filter((p) => favorites.has(p.id))

  return (
    <div className="mx-auto max-w-[920px] space-y-7 pb-10">
      <header className="space-y-3">
        <div className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
          <NavToggle />
          <Link href="/tarefas" className="rounded px-1 hover:text-foreground hover:underline">
            Tarefas
          </Link>
          <ChevronRight className="size-3.5 text-subtle" aria-hidden />
          <span className="text-foreground">Páginas</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-page-title font-semibold tracking-[-0.02em] text-foreground">Páginas</h1>
            <p className="mt-1 max-w-[60ch] text-[14px] text-muted-foreground">
              Anotações, reuniões e planejamentos da equipe — com as tarefas reais do quadro dentro deles.
            </p>
          </div>
          {status !== "unavailable" && (
            <Button onClick={() => newPage.open({})}>
              <Plus /> Nova página
            </Button>
          )}
        </div>
      </header>

      {status === "unavailable" ? (
        <Panel>
          <EmptyState
            icon={<FileText />}
            title="As páginas ainda não estão ativas neste escritório."
            description="Peça ao responsável técnico do escritório para ativar as Páginas."
          />
        </Panel>
      ) : status === "error" ? (
        <Panel>
          <EmptyState
            icon={<FileText />}
            title="Não foi possível carregar as páginas."
            description="Verifique a conexão e tente de novo."
            action={
              <Button variant="secondary" onClick={() => void reload()}>
                Tentar de novo
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <section aria-labelledby="modelos">
            <h2 id="modelos" className="mb-2.5 text-[13px] font-semibold text-foreground">
              Começar com um modelo
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {PAGE_TEMPLATES.map((t) => {
                const Icon = ICON[t.key]
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => newPage.open({ template: t.key })}
                      className="flex h-full w-full flex-col items-start gap-2 rounded-[12px] border border-border bg-card p-3 text-left outline-none transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-xs focus-visible:ring-2 focus-visible:ring-brand/40 motion-reduce:hover:translate-y-0"
                    >
                      <span className="flex size-8 items-center justify-center rounded-[8px] bg-surface-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="text-[13px] leading-tight font-medium text-foreground">{t.name}</span>
                      <span className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{t.description}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {status === "loading" ? (
            <div className="space-y-2" aria-busy="true" aria-label="Carregando páginas">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-[10px] bg-surface-muted motion-reduce:animate-none" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<FileText />}
                title="Nenhuma página ainda."
                description="Crie uma página para registrar reuniões, planejar a semana ou organizar um caso — e inclua as tarefas do quadro nela."
                action={
                  <Button onClick={() => newPage.open({})}>
                    <Plus /> Criar a primeira página
                  </Button>
                }
              />
            </Panel>
          ) : (
            <>
              {favs.length > 0 && (
                <section aria-labelledby="favoritas">
                  <h2 id="favoritas" className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    <Star className="size-3.5 fill-gold text-gold" aria-hidden /> Favoritas
                  </h2>
                  <ul className="divide-y divide-border/60 rounded-card border border-border bg-card p-1">
                    {favs.map((p) => (
                      <PageRow key={p.id} page={p} pages={pages} />
                    ))}
                  </ul>
                </section>
              )}
              <section aria-labelledby="recentes">
                <h2 id="recentes" className="mb-1.5 text-[13px] font-semibold text-foreground">
                  Editadas recentemente
                </h2>
                <ul className="divide-y divide-border/60 rounded-card border border-border bg-card p-1">
                  {recent.map((p) => (
                    <PageRow key={p.id} page={p} pages={pages} />
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
