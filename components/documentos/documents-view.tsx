"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CloudUpload, FolderOpen, SearchX, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { SideSheet } from "@/components/ui/side-sheet"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { useUI } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"
import { getNow } from "@/lib/core/dates"
import { processSubject } from "@/lib/processos/label"
import { shortProcessNumber } from "./documents-nav"
import { Paginated } from "./pagination"
import {
  breadcrumbs,
  EMPTY_STATE,
  hasFilters,
  readState,
  SECTIONS,
  SORTS,
  stateParams,
  type LibraryState,
  type SortDir,
  type SortKey,
} from "@/lib/documentos/library"
import type { LegalDocument } from "@/types"
import { DocumentsActionsProvider } from "./document-actions"
import { DocumentDetails } from "./document-details"
import { DocumentViewer } from "./document-viewer"
import { DocumentsNav } from "./documents-nav"
import { Breadcrumbs, DocumentsToolbar, FilterChips, type View } from "./documents-toolbar"
import { FileGrid } from "./file-grid"
import { FileList, type FileViewProps } from "./file-list"
import { SelectionBar } from "./selection-bar"
import { isNewDocument, useDocumentLibrary } from "./use-document-library"

const VIEW_KEY = "lexa:documentos:view"
const SORT_KEY = "lexa:documentos:ordem"
const DETAILS_KEY = "lexa:documentos:detalhes"
/** Larguras da Central a partir das quais as pastas e os detalhes viram colunas. */
const NAV_COLUMN_MIN = 880
const DETAILS_COLUMN_MIN = 1100

function readLocal<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key)
    const value = raw ? JSON.parse(raw) : undefined
    return valid(value) ? value : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Preferência só local.
  }
}

const isView = (v: unknown): v is View => v === "lista" || v === "grade"
const isSort = (v: unknown): v is { key: SortKey; dir: SortDir } =>
  !!v && typeof v === "object" && SORTS.some((s) => s.value === (v as { key: string }).key) && ["asc", "desc"].includes((v as { dir: string }).dir)

function useElementWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Central de Documentos: navegação à esquerda, arquivos no centro e detalhes à direita
 * (quando pedidos). O lugar e os filtros ficam na URL — atualizar a página, voltar e
 * compartilhar o link levam ao mesmo lugar.
 */
export function DocumentsView() {
  const data = useOfficeData()
  const { retryLoad } = useOfficeActions()
  const { openDialog } = useUI()
  const { can } = useSession()
  const canEdit = can("documents.edit")
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const paramsKey = params.toString()
  const urlState = React.useMemo(() => readState(new URLSearchParams(paramsKey)), [paramsKey])
  // A tela muda na hora; a URL acompanha logo depois. Se a URL mudar por outro caminho
  // (voltar, atalho da barra lateral), vale a URL.
  const [pending, setPending] = React.useState<LibraryState | null>(null)
  const [seenKey, setSeenKey] = React.useState(paramsKey)
  if (seenKey !== paramsKey) {
    setSeenKey(paramsKey)
    setPending(null)
  }
  const state = pending ?? urlState

  const [search, setSearch] = React.useState("")
  const [sort, setSortState] = React.useState(() => readLocal(SORT_KEY, { key: "enviado" as SortKey, dir: "desc" as SortDir }, isSort))
  const [view, setViewState] = React.useState<View>(() => readLocal(VIEW_KEY, "lista", isView))
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set())
  const [detailId, setDetailId] = React.useState<string>()
  // Telas largas: o painel do documento fica sempre ao lado (como no Drive); dá para fechar.
  const [detailsHidden, setDetailsHiddenState] = React.useState(() => readLocal(DETAILS_KEY, false, (v): v is boolean => typeof v === "boolean"))
  const setDetailsHidden = (v: boolean) => {
    setDetailsHiddenState(v)
    writeLocal(DETAILS_KEY, v)
  }
  const [viewerId, setViewerId] = React.useState<string>()
  const [navOpen, setNavOpen] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>()

  const lib = useDocumentLibrary(state, search, sort)
  const client = byId(data.clients, state.clientId)
  const process = byId(data.processes, state.processId)
  const crumbs = breadcrumbs(state, { client: client?.name, process: process ? `Processo ${shortProcessNumber(process)}` : undefined })
  const here = crumbs[crumbs.length - 1].label
  // Trilha do cabeçalho: começa no escritório ("Escritório / Clientes / Ana Martins / Processo …").
  const trail = [{ ...crumbs[0], label: "Escritório", target: crumbs.length > 1 ? crumbs[0].target : undefined }, ...crumbs.slice(1)]
  const subtitle = process
    ? `Gerencie os documentos deste processo${process ? ` (${processSubject(process)})` : ""}. Organize, compartilhe e mantenha tudo seguro.`
    : client
      ? "Gerencie os documentos deste cliente. Organize, compartilhe e mantenha tudo seguro."
      : "Gerencie os documentos do escritório. Organize, compartilhe e mantenha tudo seguro."

  const navigate = React.useCallback(
    (next: LibraryState) => {
      const query = stateParams(next).toString()
      setPending(next)
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
      setSelected(new Set())
      setNavOpen(false)
      if (next.section !== state.section || next.clientId !== state.clientId) setSearch("")
    },
    [router, pathname, state.section, state.clientId],
  )

  const setSort = (s: { key: SortKey; dir: SortDir }) => {
    setSortState(s)
    writeLocal(SORT_KEY, s)
  }
  const setView = (v: View) => {
    setViewState(v)
    writeLocal(VIEW_KEY, v)
  }
  const sortBy = React.useCallback(
    (key: SortKey) =>
      setSortState((s) => {
        const next = { key, dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : SORTS.find((x) => x.value === key)!.defaultDir } as const
        writeLocal(SORT_KEY, next)
        return next
      }),
    [],
  )

  // Seleção: clique alterna; Shift+clique marca o intervalo desde o último clicado.
  const rowsRef = React.useRef<LegalDocument[]>([])
  const lastIndex = React.useRef<number | null>(null)
  React.useEffect(() => {
    rowsRef.current = lib.rows
  })
  const onToggle = React.useCallback((id: string, index: number, shift: boolean) => {
    setSelected((set) => {
      const next = new Set(set)
      if (shift && lastIndex.current !== null) {
        const [from, to] = [Math.min(lastIndex.current, index), Math.max(lastIndex.current, index)]
        for (const d of rowsRef.current.slice(from, to + 1)) next.add(d.id)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastIndex.current = index
  }, [])
  const onToggleAll = React.useCallback((ids: string[], on: boolean) => {
    setSelected((set) => {
      const next = new Set(set)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])
  const clearSelection = React.useCallback(() => {
    setSelected(new Set())
    lastIndex.current = null
  }, [])

  // Esc limpa a seleção (quando nenhum diálogo está aberto).
  React.useEffect(() => {
    if (!selected.size) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=dialog],[role=alertdialog],[role=menu]")) return
      clearSelection()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected.size, clearSelection])

  const selectedDocs = data.documents.filter((d) => selected.has(d.id))
  const navAsColumn = rootWidth >= NAV_COLUMN_MIN
  const detailsAsColumn = rootWidth >= DETAILS_COLUMN_MIN
  const chosen = detailId ? data.documents.find((d) => d.id === detailId) : undefined
  // Em coluna, sem escolha: o primeiro selecionado ou o primeiro da lista.
  const detail = chosen ?? (detailsAsColumn && !detailsHidden ? (selectedDocs[0] ?? lib.rows[0]) : undefined)
  const isNew = React.useCallback((d: LegalDocument) => isNewDocument(d, getNow()), [])

  const upload = (files?: File[]) =>
    openDialog("document", {
      clientId: state.clientId,
      processId: state.processId,
      documentKind: state.kind,
      files,
    })

  // Arrastar arquivos do computador para a área: envio (não confunde com mover documentos).
  const dragProps = canEdit
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes("Files")) setDragging(true)
        },
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          e.dataTransfer.dropEffect = "copy"
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        },
        onDrop: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          setDragging(false)
          const files = Array.from(e.dataTransfer.files)
          if (files.length) upload(files)
        },
      }
    : {}

  const viewProps: FileViewProps = {
    rows: [],
    folders: lib.folders,
    selected,
    activeId: detail?.id,
    onToggle,
    onToggleAll,
    onOpenFolder: navigate,
    sort,
    onSort: sortBy,
    isNew,
  }

  const summary =
    state.section === "clientes" && !state.clientId
      ? `${lib.folders.length} cliente${lib.folders.length === 1 ? "" : "s"} com documentos`
      : lib.folders.length
        ? [
            `${lib.folders.length} processo${lib.folders.length === 1 ? "" : "s"}`,
            lib.rows.length && `${lib.rows.length} documento${lib.rows.length === 1 ? "" : "s"} sem processo`,
          ]
            .filter(Boolean)
            .join(" · ")
        : lib.total !== undefined
          ? `${lib.total} documento${lib.total === 1 ? "" : "s"}`
          : undefined
  const partialSort = !!lib.history && !lib.history.done && !(sort.key === "enviado" && sort.dir === "desc")

  let content: React.ReactNode
  if (lib.error) content = <ErrorState title="Não foi possível carregar os documentos." onRetry={retryLoad} />
  else if (lib.loading)
    content = (
      <div className="p-3">
        <SkeletonTable />
      </div>
    )
  else if (state.section === "favoritos" && lib.favorites.status === "unavailable")
    content = (
      <EmptyState
        icon={<Star />}
        title="Favoritos ainda não estão ativos neste escritório."
        description="O recurso depende de uma atualização do banco de dados. Os demais documentos continuam disponíveis em Todos os documentos."
      />
    )
  else if (state.section === "favoritos" && lib.favorites.status === "error")
    content = <ErrorState title="Não foi possível carregar seus favoritos." onRetry={lib.favorites.retry} />
  else if (!lib.rows.length && !lib.folders.length) {
    const searchingSomething = !!search.trim() || hasFilters(state)
    content = (
      <div>
        {searchingSomething ? (
          <EmptyState
            icon={<SearchX />}
            title={search.trim() ? `Nada encontrado para “${search.trim()}”.` : "Nenhum documento com estes filtros."}
            description={
              hasFilters(state)
                ? "Os filtros ativos também valem para a busca. Remova algum ou busque em todos os documentos."
                : `A busca procura no nome, na categoria, no cliente e no processo, em ${here}.`
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {search.trim() && (
                  <Button size="sm" variant="secondary" onClick={() => setSearch("")}>
                    Limpar busca
                  </Button>
                )}
                {hasFilters(state) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate({
                        ...EMPTY_STATE,
                        section: state.section,
                        ...(state.section === "clientes" ? { clientId: state.clientId, processId: state.processId } : {}),
                      })
                    }
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            }
          />
        ) : state.section === "favoritos" ? (
          <EmptyState
            icon={<Star />}
            title="Nenhum favorito ainda."
            description="Marque os documentos que você usa sempre (menu ⋯ › Adicionar aos favoritos). Seus favoritos são só seus."
          />
        ) : state.section === "clientes" && !state.clientId ? (
          <EmptyState
            icon={<FolderOpen />}
            title="Nenhum cliente com documentos."
            description="Ao enviar um documento ligado a um cliente, ele aparece aqui, com os processos dele."
          />
        ) : (
          <EmptyState
            icon={<FolderOpen />}
            title={data.documents.length || lib.counts.all ? "Nada aqui ainda." : "Nenhum documento ainda."}
            description={
              data.documents.length || lib.counts.all
                ? `Não há documentos em ${here}.${canEdit ? " Envie arquivos para cá: eles já entram com este cliente, processo e categoria." : ""}`
                : "Contratos, procurações e peças ficam aqui, ligados aos clientes e processos."
            }
            action={
              canEdit ? (
                <Button size="sm" onClick={() => upload()}>
                  <CloudUpload /> Enviar arquivos
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    )
  } else
    content = (
      <Paginated
        items={lib.rows}
        listKey={`${paramsKey}|${search}|${sort.key}${sort.dir}|${view}`}
        server={lib.history}
        total={state.section === "todos" ? lib.total : lib.rows.length + lib.folders.length > 0 ? lib.rows.length : undefined}
      >
        {(visibleRows) =>
          view === "grade" ? (
            <div className="p-3">
              <FileGrid {...viewProps} rows={visibleRows} />
            </div>
          ) : (
            <FileList {...viewProps} rows={visibleRows} />
          )
        }
      </Paginated>
    )

  const nav = (
    <DocumentsNav state={state} onNavigate={navigate} counts={lib.counts} clients={lib.clientsWithDocs} favoritesStatus={lib.favorites.status} />
  )
  const backLabel = SECTIONS.some((s) => s.label === here) || crumbs.length > 1 ? here : "Documentos"

  const columns = [navAsColumn && "212px", "minmax(0,1fr)", detail && detailsAsColumn && "244px"].filter(Boolean).join(" ")

  return (
    <DocumentsActionsProvider onOpen={(d) => setViewerId(d.id)} onDetails={(d) => setDetailId(d.id)}>
      <div ref={rootRef} className="min-w-0 space-y-4">
        <header className="space-y-2">
          <Breadcrumbs crumbs={trail} onNavigate={navigate} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-page-title font-semibold tracking-[-0.02em] text-foreground">Documentos</h1>
              <p className="mt-1 max-w-[70ch] text-[13.5px] text-muted-foreground">{subtitle}</p>
            </div>
            {canEdit && (
              <Button onClick={() => upload()}>
                <CloudUpload /> Enviar arquivos
              </Button>
            )}
          </div>
        </header>

        <DocumentsToolbar
          state={state}
          onChange={navigate}
          search={search}
          onSearch={setSearch}
          searching={lib.searching}
          sort={sort}
          onSort={setSort}
          view={view}
          onView={setView}
          clients={lib.clientsWithDocs}
          detailsOpen={!!detail}
          onToggleDetails={
            detail
              ? () => {
                  setDetailId(undefined)
                  if (detailsAsColumn) setDetailsHidden(true)
                }
              : lib.rows[0]
                ? () => {
                    setDetailsHidden(false)
                    setDetailId((selectedDocs[0] ?? lib.rows[0]).id)
                  }
                : undefined
          }
          onOpenNav={navAsColumn ? undefined : () => setNavOpen(true)}
        />
        <FilterChips state={state} onChange={navigate} />
        {partialSort && (
          <p className="text-[12px] text-subtle">A ordem vale para os documentos já carregados; as próximas páginas trazem os anteriores.</p>
        )}

        <div className="grid min-w-0 items-start gap-3.5" style={{ gridTemplateColumns: columns }}>
          {navAsColumn && (
            <aside className="sticky top-24 min-w-0">
              <div className="max-h-[calc(100dvh-7.5rem)] overflow-y-auto rounded-card border border-border bg-card p-2 thin-scrollbar">{nav}</div>
            </aside>
          )}

          <section
            aria-label={`Arquivos em ${here}`}
            className="@container/files relative min-w-0 overflow-hidden rounded-card border border-border bg-card"
            {...dragProps}
          >
            {summary && !lib.loading && lib.folders.length > 0 && (
              <p className="border-b border-border/70 px-4 py-2.5 text-[12.5px] text-muted-foreground">{summary}</p>
            )}
            <div className="transition-opacity duration-150">{content}</div>

            {dragging && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-card border-2 border-dashed border-brand bg-brand-soft/80 backdrop-blur-[1px]"
              >
                <div className="rounded-[12px] bg-card px-6 py-4 text-center shadow-float">
                  <CloudUpload className="mx-auto size-6 text-brand" />
                  <p className="mt-2 text-[14px] font-semibold text-foreground">Solte para enviar para {here}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">PDF, Word, Excel, TXT, JPG ou PNG — até 25 MB cada</p>
                </div>
              </div>
            )}
          </section>

          {detail && detailsAsColumn && (
            <div className="sticky top-24 min-w-0">
              <DocumentDetails
                doc={detail}
                onClose={() => {
                  setDetailId(undefined)
                  setDetailsHidden(true)
                }}
                className="max-h-[calc(100dvh-7.5rem)]"
              />
            </div>
          )}
        </div>
        <SelectionBar docs={selectedDocs} onClear={clearSelection} />
      </div>

      {/* Telas menores: detalhes num painel que não tira a pessoa da lista. */}
      {!detailsAsColumn && (
        <SideSheet
          open={!!chosen}
          onOpenChange={(open) => !open && setDetailId(undefined)}
          title={detail ? `Detalhes de ${detail.name}` : "Detalhes"}
          className="sm:w-[420px]"
        >
          {detail && <DocumentDetails doc={detail} onClose={() => setDetailId(undefined)} className="rounded-none border-0" embedded />}
        </SideSheet>
      )}

      {/* Navegação no celular e no tablet. */}
      {!navAsColumn && (
        <SideSheet open={navOpen} onOpenChange={setNavOpen} title="Pastas de documentos" className="sm:w-[340px]">
          <div className="p-3 pt-12">{nav}</div>
        </SideSheet>
      )}

      <DocumentViewer documentId={viewerId} onClose={() => setViewerId(undefined)} backLabel={backLabel} />
    </DocumentsActionsProvider>
  )
}
