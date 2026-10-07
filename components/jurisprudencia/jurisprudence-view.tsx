"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { BookOpenText, ChevronLeft, ChevronRight, SlidersHorizontal, Search, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { NativeSelect, TextInput } from "@/components/ui/field"
import { SkeletonTable } from "@/components/ui/skeleton"
import { useDebounced } from "@/lib/store/on-demand"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { fmtNumericDate } from "@/lib/core/dates"
import type { JurisprudenceFilters, JurisprudenceSort } from "@/lib/services/jurisprudence/types"
import { jurisApi, type Facet, type SavedEntry, type SearchResponse, type StatusResponse } from "./api"
import { DecisionSheet, type DecisionChange } from "./decision-sheet"
import { ResultRow } from "./result-row"

type Tab = "pesquisa" | "salvas"

/** Busca automática a partir daqui (antes, só com Enter ou o botão). */
const AUTO_MIN_CHARS = 3

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
      <Button size="sm" variant="secondary" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft /> Anterior
      </Button>
      <span className="tabular text-[12.5px] text-muted-foreground">
        Página {page} de {pages.toLocaleString("pt-BR")}
      </span>
      <Button size="sm" variant="secondary" onClick={() => onChange(page + 1)} disabled={page >= pages}>
        Próxima <ChevronRight />
      </Button>
    </nav>
  )
}

function Select({ label, value, onChange, options, all = "Todos" }: { label: string; value?: string; onChange: (v: string) => void; options?: Facet[]; all?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted-foreground">
      {label}
      <NativeSelect value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-9 text-[13px]">
        <option value="">{all}</option>
        {(options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.total.toLocaleString("pt-BR")})
          </option>
        ))}
      </NativeSelect>
    </label>
  )
}

/**
 * Jurisprudência: pesquisar → resultados reais da base oficial → abrir a decisão →
 * Análise da Íntegra (sob demanda) → fonte original → salvar → vincular ao processo.
 */
export function JurisprudenceView() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const data = useOfficeData()
  const processId = params.get("processo") ?? undefined
  const contextProcess = processId ? byId(data.processes, processId) : undefined
  const selected = params.get("id") ?? undefined

  const [status, setStatus] = React.useState<StatusResponse | null>(null)
  const [statusError, setStatusError] = React.useState<string>()
  const [facets, setFacets] = React.useState<Record<string, Facet[]>>({})
  const [tab, setTab] = React.useState<Tab>("pesquisa")
  const [text, setText] = React.useState(params.get("q") ?? "")
  const [submitted, setSubmitted] = React.useState(params.get("q") ?? "")
  const [filters, setFilters] = React.useState<JurisprudenceFilters>({})
  const [sort, setSort] = React.useState<JurisprudenceSort>("relevance")
  const [page, setPage] = React.useState(1)
  const [moreFilters, setMoreFilters] = React.useState(false)
  const [response, setResponse] = React.useState<{ key: string; data?: SearchResponse; error?: string }>({ key: "" })
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set())
  const [saving, setSaving] = React.useState<string | null>(null)
  const [savedList, setSavedList] = React.useState<{ entries: SavedEntry[]; total: number; page: number; pages: number } | null>(null)
  const [savedPage, setSavedPage] = React.useState(1)
  const [attempt, setAttempt] = React.useState(0)

  // Digitar pesquisa sozinho depois de uma pausa; Enter pesquisa na hora.
  const debounced = useDebounced(text.trim(), 500)
  const [lastDebounced, setLastDebounced] = React.useState(debounced)
  if (debounced !== lastDebounced) {
    setLastDebounced(debounced)
    if (debounced.length >= AUTO_MIN_CHARS || debounced.length === 0) {
      setSubmitted(debounced)
      setPage(1)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    jurisApi
      .status()
      .then((s) => {
        if (cancelled) return
        setStatus(s)
        if (s.configured && s.total > 0) void jurisApi.facets().then((f) => !cancelled && setFacets(f.facets)).catch(() => {})
      })
      .catch((e: Error) => !cancelled && setStatusError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  const ready = !!status?.configured && status.total > 0

  // Uma pesquisa por combinação de termos/filtros/página; "carregando" = a resposta ainda é de outra combinação.
  const requestKey = JSON.stringify({ submitted, filters, sort, page, attempt })
  const loading = ready && tab === "pesquisa" && response.key !== requestKey
  const results = response.data ?? null
  const error = response.key === requestKey ? response.error : undefined
  React.useEffect(() => {
    if (!ready || tab !== "pesquisa") return
    const controller = new AbortController()
    jurisApi
      .search({ text: submitted, filters, sort, page }, controller.signal)
      .then((r) => {
        setResponse({ key: requestKey, data: r })
        setSavedIds((prev) => new Set([...[...prev].filter((id) => !r.results.some((x) => x.id === id)), ...r.savedIds]))
      })
      .catch((e: Error) => e.name !== "AbortError" && setResponse((prev) => ({ key: requestKey, data: prev.data, error: e.message })))
    return () => controller.abort()
  }, [ready, tab, submitted, filters, sort, page, requestKey])

  React.useEffect(() => {
    if (!ready || tab !== "salvas") return
    let cancelled = false
    jurisApi
      .saved(savedPage)
      .then((r) => !cancelled && setSavedList(r))
      .catch((e: Error) => !cancelled && toast.error(e.message))
    return () => {
      cancelled = true
    }
  }, [ready, tab, savedPage, attempt])

  const open = (id?: string) => {
    const next = new URLSearchParams(params.toString())
    if (id) next.set("id", id)
    else next.delete("id")
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false })
  }

  const setFilter = (key: keyof JurisprudenceFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }))
    setPage(1)
  }

  const toggleSave = async (id: string) => {
    setSaving(id)
    const was = savedIds.has(id)
    try {
      if (was) await jurisApi.unsave(id)
      else await jurisApi.save(id)
      setSavedIds((prev) => {
        const next = new Set(prev)
        if (was) next.delete(id)
        else next.add(id)
        return next
      })
      toast.success(was ? "Removida das salvas." : "Jurisprudência salva no escritório.")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  const onDecisionChange = (change: DecisionChange) => {
    if (change.saved === undefined) return
    setSavedIds((prev) => {
      const next = new Set(prev)
      if (change.saved) next.add(change.id)
      else next.delete(change.id)
      return next
    })
    if (tab === "salvas") setAttempt((n) => n + 1)
  }

  const activeFilters = Object.values(filters).filter(Boolean).length
  const searched = submitted.length > 0
  const source = status?.sources[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jurisprudência"
        description="Decisões reais de fontes oficiais. Pesquise, leia a decisão, peça a Análise da Íntegra, salve e vincule aos processos."
      />

      {statusError ? (
        <Panel>
          <ErrorState title={statusError} onRetry={() => location.reload()} />
        </Panel>
      ) : !status ? (
        <SkeletonTable rows={5} />
      ) : !status.configured ? (
        <Panel>
          <EmptyState
            icon={<BookOpenText />}
            title="Pesquisa de jurisprudência ainda não configurada."
            description="A administração da Íntegra precisa ligar a fonte oficial de jurisprudência para o servidor. Nenhuma decisão é mostrada sem fonte real."
          />
        </Panel>
      ) : status.total === 0 ? (
        <Panel>
          <EmptyState
            icon={<BookOpenText />}
            title="A base de jurisprudência está sendo preparada."
            description={`As decisões do ${source?.tribunal ?? "tribunal"} entram pela sincronização automática com a fonte oficial (${source?.label ?? "dados abertos"}). Volte em breve.`}
          />
        </Panel>
      ) : (
        <>
          {contextProcess && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-brand/20 bg-brand-soft/40 px-4 py-2.5 text-[13px]">
              <span>
                Pesquisando para o <span className="font-medium">Processo {contextProcess.code}</span> — abra uma decisão para compará-la e vinculá-la.
              </span>
              <Link href={`/processos/${contextProcess.id}`} className="font-medium text-brand-strong hover:underline">
                Voltar ao processo
              </Link>
            </div>
          )}

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(text.trim())
              setPage(1)
              setTab("pesquisa")
            }}
            className="space-y-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                <input
                  type="search"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={300}
                  placeholder='Ex.: indenização por negativação indevida sem prévia notificação · use "aspas" para frase exata'
                  aria-label="Pesquisar jurisprudência"
                  className="h-11 w-full rounded-control border border-border bg-surface pr-9 pl-10 text-[14px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-subtle hover:border-border-strong focus:border-brand/60 focus:ring-4 focus:ring-brand/10 [&::-webkit-search-cancel-button]:hidden"
                />
                {text && (
                  <button
                    type="button"
                    aria-label="Limpar pesquisa"
                    onClick={() => {
                      setText("")
                      setSubmitted("")
                      setPage(1)
                    }}
                    className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <Button type="submit" className="h-11">
                <Search /> Pesquisar
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Select label="Órgão julgador" value={filters.court} onChange={(v) => setFilter("court", v)} options={facets.court} />
              <Select label="Classe" value={filters.class} onChange={(v) => setFilter("class", v)} options={facets.class} all="Todas" />
              <Select label="Área" value={filters.area} onChange={(v) => setFilter("area", v)} options={facets.area} all="Todas" />
              <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted-foreground">
                Ordenar por
                <NativeSelect
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as JurisprudenceSort)
                    setPage(1)
                  }}
                  className="h-9 text-[13px]"
                >
                  <option value="relevance">Relevância</option>
                  <option value="recent">Mais recentes</option>
                </NativeSelect>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMoreFilters((v) => !v)}
                aria-expanded={moreFilters}
                className="touch-target relative inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <SlidersHorizontal className="size-3.5" /> {moreFilters ? "Menos filtros" : "Mais filtros"}
              </button>
              {activeFilters > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilters({})
                    setPage(1)
                  }}
                  className="text-[12.5px] font-medium text-brand-strong hover:underline"
                >
                  Limpar {activeFilters === 1 ? "1 filtro" : `${activeFilters} filtros`}
                </button>
              )}
            </div>

            {moreFilters && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Select label="Tribunal" value={filters.tribunal} onChange={(v) => setFilter("tribunal", v)} options={facets.tribunal} />
                <Select label="Grau" value={filters.degree} onChange={(v) => setFilter("degree", v)} options={facets.degree} />
                <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted-foreground">
                  Assunto contém
                  <TextInput
                    value={filters.subject ?? ""}
                    onChange={(e) => setFilter("subject", e.target.value.slice(0, 120))}
                    placeholder="Ex.: consumidor"
                    className="h-9 text-[13px]"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted-foreground">
                  Julgado a partir de
                  <TextInput type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value)} className="h-9 text-[13px]" />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted-foreground">
                  Julgado até
                  <TextInput type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value)} className="h-9 text-[13px]" />
                </label>
              </div>
            )}
          </form>

          <FilterTabs
            ariaLabel="Jurisprudência"
            layoutId="juris-tabs"
            value={tab}
            onChange={setTab}
            options={[
              { value: "pesquisa", label: "Pesquisa", count: results?.total },
              { value: "salvas", label: "Salvas do escritório", count: savedList?.total },
            ]}
          />

          {tab === "pesquisa" ? (
            <Panel className="overflow-hidden">
              <PanelHeader
                title={searched ? (results ? `${results.total.toLocaleString("pt-BR")} ${results.total === 1 ? "decisão encontrada" : "decisões encontradas"}` : "Pesquisando…") : "Decisões mais recentes na base"}
                description={`Fonte: ${status.sources.map((s) => s.label).join(", ")} · ${status.total.toLocaleString("pt-BR")} decisões indexadas${
                  source?.lastSuccess ? ` · atualizada em ${fmtNumericDate(source.lastSuccess)}` : ""
                }`}
              />
              {error ? (
                <ErrorState title={error} onRetry={() => setAttempt((n) => n + 1)} />
              ) : loading && !results ? (
                <SkeletonTable rows={5} />
              ) : results && results.results.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Search />}
                  title="Nenhuma decisão encontrada."
                  description="Tente outros termos (ex.: sinônimos jurídicos), menos palavras ou remova filtros."
                />
              ) : (
                <ul className={cn("divide-y divide-border border-t border-border transition-opacity", loading && "opacity-60")} aria-busy={loading}>
                  {results?.results.map((r) => (
                    <ResultRow
                      key={r.id}
                      result={r}
                      searched={searched}
                      saved={savedIds.has(r.id)}
                      saving={saving === r.id}
                      onOpen={() => open(r.id)}
                      onToggleSave={() => void toggleSave(r.id)}
                    />
                  ))}
                </ul>
              )}
              {results && !error && <Pager page={results.page} pages={results.pages} onChange={(p) => (setPage(p), window.scrollTo({ top: 0, behavior: "smooth" }))} />}
            </Panel>
          ) : (
            <Panel className="overflow-hidden">
              <PanelHeader title="Salvas do escritório" description="Visíveis a toda a equipe com acesso a processos. Só o seu escritório vê esta lista." />
              {!savedList ? (
                <SkeletonTable rows={3} />
              ) : savedList.entries.length === 0 ? (
                <EmptyState compact icon={<BookOpenText />} title="Nenhuma jurisprudência salva." description="Use “Salvar” nos resultados ou na decisão para guardar aqui." />
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {savedList.entries.map((entry) => (
                    <React.Fragment key={entry.id}>
                      <ResultRow
                        result={entry.decision}
                        searched={false}
                        saved
                        saving={saving === entry.decision.id}
                        onOpen={() => open(entry.decision.id)}
                        onToggleSave={() =>
                          void toggleSave(entry.decision.id).then(() => setSavedList((s) => (s ? { ...s, entries: s.entries.filter((x) => x.id !== entry.id), total: s.total - 1 } : s)))
                        }
                      />
                      {entry.notes && <li className="-mt-2 px-4 pb-3 text-[12.5px] text-foreground/80 sm:px-5">Observação: {entry.notes}</li>}
                    </React.Fragment>
                  ))}
                </ul>
              )}
              {savedList && <Pager page={savedList.page} pages={savedList.pages} onChange={setSavedPage} />}
            </Panel>
          )}
        </>
      )}

      <DecisionSheet id={selected} onOpenChange={(o) => !o && open()} processId={processId} query={submitted || undefined} onChange={onDecisionChange} />
    </div>
  )
}
