"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronRight, FilePlus, FolderOpen, LayoutGrid, Link2, List, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/ui/user-avatar"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { FadeIn } from "@/components/ui/motion"
import { NativeSelect } from "@/components/ui/field"
import { FileIcon } from "@/components/shared/file-icon"
import { DocumentActions, DocumentList } from "@/components/shared/document-list"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useDebounced, useHistoryStats, usePagedHistory } from "@/lib/store/on-demand"
import { documentSearch, olderDocuments, uploadedKey, type KindFilter } from "@/lib/store/history-lists"
import { byId } from "@/lib/store/indexes"
import { searchFilter } from "@/lib/store/storage"
import { LIST_PAGE, LimitedList } from "@/components/ui/show-more"
import { useUI } from "@/lib/store/ui-store"
import { diffInDays, fmtNumericDate, getNow, parse } from "@/lib/core/dates"
import { RECENT_DAYS } from "@/lib/dashboard/attention"
import { formatFileSize, matches } from "@/lib/core/format"
import { getUser } from "@/lib/auth/account"
import type { Client, DocumentKind, LegalDocument, Process } from "@/types"
import { Can, useSession } from "@/lib/auth/session"
import { SideSheet } from "@/components/ui/side-sheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useMediaQuery } from "@/lib/core/hooks"
import { documentUrl } from "@/lib/documentos/documents"
import { DocumentsTree, type TreeSelection } from "./documents-tree"
import { DocumentDetails } from "./document-details"
import { usePreview } from "@/components/shared/document-preview-sheet"

type Filter = "todos" | "Contrato" | "Procuração" | "Petição" | "Documento pessoal" | "Laudo" | "outros"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "Contrato", label: "Contratos" },
  { value: "Procuração", label: "Procurações" },
  { value: "Petição", label: "Petições" },
  { value: "Documento pessoal", label: "Pessoais" },
  { value: "Laudo", label: "Laudos" },
  { value: "outros", label: "Outros" },
]

const MAIN_KINDS: DocumentKind[] = ["Contrato", "Procuração", "Petição", "Documento pessoal", "Laudo"]

const kindFilter = (f: Filter): KindFilter => (f === "todos" ? null : f === "outros" ? { notIn: MAIN_KINDS } : { kind: f })

type Sort = "recentes" | "nome" | "tamanho"
type View = "lista" | "grade"

const SORTS: { value: Sort; label: string }[] = [
  { value: "recentes", label: "Mais recentes" },
  { value: "nome", label: "Nome (A–Z)" },
  { value: "tamanho", label: "Maior tamanho" },
]

const VIEW_KEY = "lexa:documentos:view"
/** Detalhes como coluna ao lado da lista só com espaço para as três colunas. */
const DETAILS_COLUMN_QUERY = "(min-width: 1536px)"
const SHARE_SECONDS = 7 * 24 * 60 * 60

interface DocumentStats {
  total: number
  bytes: number
  kinds: Record<string, number>
  clients: string[]
}

export function DocumentsView() {
  const data = useOfficeData()
  const { openDialog } = useUI()
  const { windowBounds } = useOfficeActions()
  const ready = data.hydrated
  const { can } = useSession()
  const { deleteDocument } = useOfficeActions()
  const [filter, setFilter] = React.useState<Filter>("todos")
  const [clientId, setClientId] = React.useState("")
  // "Pastas" derivadas das relações do documento: recentes, tipo, cliente › processo.
  const pasta = useSearchParams().get("pasta")
  const [scope, setScope] = React.useState<"todos" | "recentes">(pasta === "recentes" ? "recentes" : "todos")
  // Um link com `?pasta=` aberto com a tela já montada (atalho da barra lateral) também troca a pasta.
  const [lastPasta, setLastPasta] = React.useState(pasta)
  if (pasta !== lastPasta) {
    setLastPasta(pasta)
    setScope(pasta === "recentes" ? "recentes" : "todos")
  }
  const [processId, setProcessId] = React.useState("")
  const [sort, setSort] = React.useState<Sort>("recentes")
  const [view, setView] = React.useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "grade" ? "grade" : "lista"
    } catch {
      return "lista"
    }
  })
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [detailId, setDetailId] = React.useState<string>()
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false)
  const detailsAsColumn = useMediaQuery(DETAILS_COLUMN_QUERY)
  const [query, setQuery] = React.useState("")
  const search = React.useDeferredValue(query)
  const term = useDebounced(query.trim())
  const listKey = `${scope}|${filter}|${clientId}|${processId}|${sort}|${search}`

  // Os documentos das últimas 2 semanas estão na memória; os anteriores vêm do banco em
  // páginas (e são contados lá), e a busca procura também neles.
  const bounds = windowBounds()
  const stats = useHistoryStats<DocumentStats>("document_history_stats", { p_before: bounds.documents })
  const test = (f: Filter, kind: DocumentKind) => (f === "todos" ? true : f === "outros" ? !MAIN_KINDS.includes(kind) : kind === f)
  const inWindow = (d: { uploadedAt?: string }) => (d.uploadedAt ?? "") >= bounds.documents
  const matchesQuery = (d: (typeof data.documents)[number]) => {
    const client = byId(data.clients, d.clientId)
    const process = byId(data.processes, d.processId)
    return matches(search, d.name, d.kind, client?.name, process?.number, process?.code)
  }
  const serverSearch = React.useMemo(() => {
    const clients = data.clients.filter((c) => matches(term, c.name)).map((c) => c.id)
    const processes = data.processes.filter((p) => matches(term, p.number, p.code)).map((p) => p.id)
    return searchFilter(term, [
      { column: "data->>clientId", ids: clients },
      { column: "data->>processId", ids: processes },
    ])
  }, [term, data.clients, data.processes])
  const historyList = React.useMemo(
    () =>
      serverSearch
        ? documentSearch(term, serverSearch, kindFilter(filter), clientId || undefined)
        : olderDocuments(bounds, kindFilter(filter), clientId || undefined),
    [serverSearch, term, filter, clientId, bounds],
  )
  // Poucos recentes neste filtro (ex.: um cliente): a primeira página do histórico vem junto.
  const recentMatches = data.documents.filter(
    (d) => inWindow(d) && test(filter, d.kind) && (!clientId || d.clientId === clientId) && (!processId || d.processId === processId),
  ).length
  const history = usePagedHistory(historyList, bounds.documents, { auto: !!serverSearch || recentMatches < LIST_PAGE })
  // Só até onde a lista está completa (mais recentes primeiro, sem buracos).
  const shown = (d: (typeof data.documents)[number]) => history.cursor === null || uploadedKey(d) >= history.cursor

  const isNew = (uploadedAt: string) => diffInDays(getNow(), parse(uploadedAt)) <= RECENT_DAYS
  const rows = data.documents
    .filter(
      (d) =>
        shown(d) &&
        (scope !== "recentes" || isNew(d.uploadedAt)) &&
        test(filter, d.kind) &&
        (!clientId || d.clientId === clientId) &&
        (!processId || d.processId === processId) &&
        matchesQuery(d),
    )
    .sort((a, b) =>
      sort === "nome"
        ? a.name.localeCompare(b.name, "pt-BR")
        : sort === "tamanho"
          ? b.sizeBytes - a.sizeBytes
          : b.uploadedAt.localeCompare(a.uploadedAt),
    )

  // Totais: os recentes (na memória) mais os anteriores (contados no banco).
  const windowDocs = data.documents.filter(inWindow)
  const totalCount = stats ? windowDocs.length + stats.total : undefined
  const totalSize = stats ? windowDocs.reduce((acc, d) => acc + d.sizeBytes, 0) + Number(stats.bytes) : undefined
  const kindCount = (f: Filter) => {
    if (!stats) return undefined
    const older = Object.entries(stats.kinds).reduce((n, [kind, count]) => n + (test(f, kind as DocumentKind) ? Number(count) : 0), 0)
    return windowDocs.filter((d) => test(f, d.kind)).length + older
  }
  // Total da lista na tela: por tipo (contado no banco); com cliente, recentes + o total do histórico dele.
  const listTotal =
    scope === "recentes"
      ? rows.length
      : search || processId
        ? undefined
        : clientId
          ? history.total !== undefined
            ? recentMatches + history.total
            : undefined
          : kindCount(filter)
  const clientsWithDocuments = React.useMemo(
    () => new Set([...data.documents.map((d) => d.clientId), ...(stats?.clients ?? [])]),
    [data.documents, stats],
  )
  const fresh = ready ? data.documents.filter((d) => isNew(d.uploadedAt)).length : 0

  const tree: TreeSelection<Filter> = { scope, kind: filter, clientId, processId }
  const selectFolder = (next: TreeSelection<Filter>) => {
    setScope(next.scope)
    setFilter(next.kind)
    setClientId(next.clientId)
    setProcessId(next.processId)
    setSelected(new Set())
  }
  const clientsWithDocs = data.clients.filter((c) => clientsWithDocuments.has(c.id))
  const processesOf = (id: string) => data.processes.filter((p) => p.clientId === id)
  const client = byId(data.clients, clientId)
  const process = byId(data.processes, processId)
  const crumbs = [
    scope === "recentes" ? "Recentes" : "Todos os documentos",
    filter !== "todos" ? FILTERS.find((f) => f.value === filter)?.label : undefined,
    client?.name,
    process ? process.type || process.code : undefined,
  ].filter(Boolean) as string[]
  const detail = detailId ? data.documents.find((d) => d.id === detailId) : undefined
  // Detalhes em coluna ao lado: a tabela perde as colunas secundárias para não cortar a data.
  const narrow = !!detail && detailsAsColumn
  const selectedDocs = data.documents.filter((d) => selected.has(d.id))
  const toggle = (id: string) =>
    setSelected((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const changeView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Preferência só local.
    }
  }
  const copyLinks = async () => {
    const withFile = selectedDocs.filter((d) => d.storagePath)
    if (!withFile.length) {
      toast("Nenhum dos selecionados tem arquivo salvo.")
      return
    }
    const urls = await Promise.all(withFile.map((d) => documentUrl(d, { download: true, expiresIn: SHARE_SECONDS })))
    const lines = withFile.flatMap((d, i) => (urls[i] ? [`${d.name}: ${urls[i]}`] : []))
    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      toast.success(`${lines.length} link${lines.length === 1 ? "" : "s"} copiado${lines.length === 1 ? "" : "s"}.`, {
        description: "Qualquer pessoa com o link baixa o arquivo por 7 dias.",
      })
    } catch {
      toast.error("Não foi possível copiar os links.", { description: "Permita o acesso à área de transferência e tente de novo." })
    }
  }
  const deleteSelected = () => {
    const count = selectedDocs.length
    for (const d of selectedDocs) deleteDocument(d.id)
    if (detailId && selected.has(detailId)) setDetailId(undefined)
    setSelected(new Set())
    toast.success(`${count} documento${count === 1 ? "" : "s"} excluído${count === 1 ? "" : "s"}.`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        description={
          ready && totalCount && totalSize !== undefined
            ? `${totalCount} arquivo${totalCount === 1 ? "" : "s"} · ${formatFileSize(totalSize)}${fresh ? ` · ${fresh} novo${fresh === 1 ? "" : "s"} nesta semana` : ""}. Cada documento fica ligado ao cliente e ao processo.`
            : "Contratos, procurações e peças do escritório, ligados a clientes e processos."
        }
        actions={
          <Can permission="documents.edit">
            <Button onClick={() => openDialog("document")}>
              <FilePlus /> Novo documento
            </Button>
          </Can>
        }
      />

      <div className="grid gap-6 @5xl/main:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden @5xl/main:block">
          <div className="sticky top-24">
            <DocumentsTree
              value={tree}
              onChange={selectFolder}
              kinds={FILTERS.map((f) => ({ ...f, count: kindCount(f.value) }))}
              allKind="todos"
              totalCount={totalCount}
              recentCount={fresh}
              clients={clientsWithDocs}
              processesOf={processesOf}
            />
          </div>
        </aside>

        <div className={cn("grid min-w-0 gap-6", detail && detailsAsColumn && "grid-cols-[minmax(0,1fr)_300px]")}>
          <div className="min-w-0 space-y-4">
            {/* Telas estreitas: sem a árvore, os mesmos filtros em linha. */}
            <div className="flex flex-col gap-2 @5xl/main:hidden">
              <FilterTabs
                ariaLabel="Filtrar por tipo"
                layoutId="docs-filter"
                value={filter}
                onChange={(f) => selectFolder({ ...tree, scope: "todos", kind: f })}
                options={FILTERS.map((f) => ({ ...f, count: kindCount(f.value) }))}
              />
              <NativeSelect
                aria-label="Filtrar por cliente"
                value={clientId}
                onChange={(e) => selectFolder({ ...tree, clientId: e.target.value, processId: "" })}
                className="h-9 text-[13px] sm:w-[260px]"
              >
                <option value="">Todos os clientes</option>
                {clientsWithDocs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {/* Barra da pasta: onde estou, busca, ordem e modo de exibição. */}
            <div className="flex flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
              <nav aria-label="Pasta atual" className="flex min-w-0 flex-1 items-center gap-1 text-[14px]">
                {crumbs.map((c, i) => (
                  <React.Fragment key={`${i}-${c}`}>
                    {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle" aria-hidden />}
                    {i === 0 && crumbs.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => selectFolder({ scope, kind: "todos", clientId: "", processId: "" })}
                        className="shrink-0 text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
                      >
                        {c}
                      </button>
                    ) : (
                      <span className={cn("truncate", i === crumbs.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground")}>{c}</span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
              <div className="flex flex-wrap items-center gap-2 @3xl/main:flex-nowrap">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar documento…"
                  className="w-full @3xl/main:w-[240px]"
                />
                <NativeSelect
                  aria-label="Ordenar"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-10 min-w-0 flex-1 text-[13px] @3xl/main:w-[148px] @3xl/main:flex-none"
                >
                  {SORTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
                <div role="group" aria-label="Exibição" className="flex shrink-0 rounded-control border border-border bg-surface p-0.5 shadow-xs">
                  {(
                    [
                      ["lista", List, "Lista"],
                      ["grade", LayoutGrid, "Grade"],
                    ] as const
                  ).map(([v, Icon, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      aria-label={label}
                      title={label}
                      onClick={() => changeView(v)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-[6px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                        view === v ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {sort !== "recentes" && !history.done && (
              <p className="text-[12px] text-subtle">A ordem vale para os documentos já carregados; &quot;Mostrar mais&quot; traz os anteriores.</p>
            )}

            {selected.size > 0 && (
              <div
                role="region"
                aria-label="Documentos selecionados"
                className="flex flex-wrap items-center gap-2 rounded-card border border-brand/25 bg-brand-soft/60 px-4 py-2.5"
              >
                <span className="text-[13px] font-medium text-brand-strong">
                  {selected.size} selecionado{selected.size === 1 ? "" : "s"}
                </span>
                <span className="flex-1" />
                <Button variant="secondary" size="sm" onClick={copyLinks}>
                  <Link2 /> Copiar links
                </Button>
                {can("documents.edit") && (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmBulkDelete(true)}>
                    <Trash2 /> Excluir
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" aria-label="Limpar seleção" onClick={() => setSelected(new Set())}>
                  <X />
                </Button>
              </div>
            )}

            {!ready || (rows.length === 0 && history.loading) ? (
              <SkeletonTable />
            ) : rows.length === 0 ? (
              <TableShell>
                <EmptyState
                  icon={<FolderOpen />}
                  title={data.documents.length || totalCount ? "Nenhum documento nesta pasta." : "Nenhum documento ainda."}
                  description={
                    data.documents.length || totalCount
                      ? "Escolha outra pasta, outro tipo ou ajuste a busca."
                      : "Adicione contratos, procurações e peças: cada arquivo fica ligado ao cliente e ao processo, e aparece no perfil de cada um."
                  }
                  action={
                    <Can permission="documents.edit">
                      <Button size="sm" onClick={() => openDialog("document")}>
                        <FilePlus /> Novo documento
                      </Button>
                    </Can>
                  }
                />
              </TableShell>
            ) : (
              <FadeIn>
                {/* Desenha 50 por vez; acabando os da memória, os anteriores vêm do banco. */}
                <LimitedList items={rows} listKey={listKey} server={scope === "recentes" ? undefined : history} total={listTotal}>
                  {(visibleRows) =>
                    view === "grade" ? (
                      <ul className="grid grid-cols-2 gap-3 @2xl/main:grid-cols-3 @5xl/main:grid-cols-4">
                        {visibleRows.map((d) => (
                          <DocumentCard
                            key={d.id}
                            doc={d}
                            client={byId(data.clients, d.clientId)}
                            fresh={isNew(d.uploadedAt)}
                            checked={selected.has(d.id)}
                            active={detailId === d.id}
                            onToggle={() => toggle(d.id)}
                            onOpen={() => setDetailId(d.id)}
                          />
                        ))}
                      </ul>
                    ) : (
                      <>
                        {/* Tabela só com espaço para as colunas; antes disso, a lista em cartões. */}
                        <TableShell className="hidden @3xl/main:block">
                          <div className="overflow-x-auto">
                            <table className="w-full border-separate border-spacing-0">
                              <thead>
                                <tr>
                                  <Th className="w-10 pr-0">
                                    <input
                                      type="checkbox"
                                      aria-label="Selecionar todos os exibidos"
                                      checked={visibleRows.length > 0 && visibleRows.every((d) => selected.has(d.id))}
                                      onChange={(e) =>
                                        setSelected((set) => {
                                          const next = new Set(set)
                                          for (const d of visibleRows) {
                                            if (e.target.checked) next.add(d.id)
                                            else next.delete(d.id)
                                          }
                                          return next
                                        })
                                      }
                                      className="size-4 cursor-pointer accent-[var(--brand)]"
                                    />
                                  </Th>
                                  <Th>Nome</Th>
                                  <Th>Cliente e processo</Th>
                                  <Th className={cn("@max-5xl/main:hidden", narrow && "hidden")}>Tipo</Th>
                                  <Th>Data</Th>
                                  <Th className={cn("@max-6xl/main:hidden", narrow && "hidden")}>Enviado por</Th>
                                  <Th className="w-10" aria-label="Ações" />
                                </tr>
                              </thead>
                              <tbody className="[&_tr:last-child_td]:border-0">
                                {visibleRows.map((d) => (
                                  <DocumentRow
                                    key={d.id}
                                    doc={d}
                                    client={byId(data.clients, d.clientId)}
                                    process={byId(data.processes, d.processId)}
                                    fresh={isNew(d.uploadedAt)}
                                    checked={selected.has(d.id)}
                                    active={detailId === d.id}
                                    onToggle={toggle}
                                    onOpen={setDetailId}
                                    narrow={narrow}
                                  />
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </TableShell>
                        <div className="overflow-hidden rounded-card border border-border/90 bg-card shadow-card @3xl/main:hidden">
                          <DocumentList documents={visibleRows} showClient />
                        </div>
                      </>
                    )
                  }
                </LimitedList>
              </FadeIn>
            )}
          </div>

          {detail && detailsAsColumn && (
            <div className="min-w-0">
              <div className="sticky top-24">
                <DocumentDetails doc={detail} onClose={() => setDetailId(undefined)} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Telas menores: os detalhes abrem num painel lateral. */}
      {!detailsAsColumn && (
        <SideSheet
          open={!!detail}
          onOpenChange={(open) => !open && setDetailId(undefined)}
          title={detail ? `Detalhes de ${detail.name}` : "Detalhes"}
          className="sm:w-[400px]"
        >
          {detail && (
            <div className="p-3 [&>aside]:border-0 [&>aside]:shadow-none">
              <DocumentDetails doc={detail} onClose={() => setDetailId(undefined)} />
            </div>
          )}
        </SideSheet>
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Excluir ${selected.size} documento${selected.size === 1 ? "" : "s"}?`}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={deleteSelected}
      />
    </div>
  )
}

/** Uma linha da tabela: só redesenha quando o próprio documento (ou seu cliente/processo) muda. */
const DocumentRow = React.memo(function DocumentRow({
  doc: d,
  client,
  process,
  fresh,
  checked,
  active,
  onToggle,
  onOpen,
  narrow,
}: {
  doc: LegalDocument
  client?: Client
  process?: Process
  fresh: boolean
  checked: boolean
  active: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  narrow: boolean
}) {
  const by = getUser(d.uploadedById)
  return (
    <tr className={cn("transition-colors", active ? "bg-brand-soft/50" : checked ? "bg-accent/50" : "hover:bg-accent/40")}>
      <Td className="w-10 pr-0">
        <input
          type="checkbox"
          aria-label={`Selecionar ${d.name}`}
          checked={checked}
          onChange={() => onToggle(d.id)}
          className="size-4 cursor-pointer accent-[var(--brand)]"
        />
      </Td>
      <Td>
        <button type="button" onClick={() => onOpen(d.id)} className="flex min-w-0 items-center gap-3 text-left outline-none focus-visible:underline">
          <FileIcon extension={d.extension} className="h-9 w-7" />
          <span className="min-w-0">
            <span className="flex max-w-[320px] items-center gap-2 font-medium text-foreground">
              <span className="truncate hover:underline">{d.name}</span>
              {fresh && <span className="shrink-0 rounded-[5px] bg-brand-soft px-1.5 text-[10.5px] font-semibold text-brand-strong">Novo</span>}
            </span>
            <span className="block text-[11.5px] text-subtle">{formatFileSize(d.sizeBytes)}</span>
          </span>
        </button>
      </Td>
      <Td>
        <div className="flex max-w-[220px] min-w-0 flex-col">
          {client ? (
            <Link href={`/clientes/${client.id}?tab=documentos`} className="truncate text-foreground hover:underline">
              {client.name}
            </Link>
          ) : (
            <span className="text-subtle">—</span>
          )}
          {process && (
            <Link
              href={`/processos/${process.id}`}
              className="truncate font-mono text-[11.5px] text-muted-foreground hover:text-foreground hover:underline"
            >
              {process.code}
            </Link>
          )}
        </div>
      </Td>
      <Td className={cn("text-muted-foreground @max-5xl/main:hidden", narrow && "hidden")}>{d.kind}</Td>
      <Td className="tabular whitespace-nowrap text-muted-foreground">{fmtNumericDate(d.uploadedAt)}</Td>
      <Td className={cn("@max-6xl/main:hidden", narrow && "hidden")}>
        <span className="flex items-center gap-2 text-muted-foreground">
          <UserAvatar name={by.name} src={by.avatarUrl} size="xs" />
          {by.firstName}
        </span>
      </Td>
      <Td>
        <DocumentActions doc={d} />
      </Td>
    </tr>
  )
})

/** Miniatura de imagem na grade (só imagens: PDFs ficam com o ícone para não carregar dezenas de visualizadores). */
function ImageThumb({ doc }: { doc: LegalDocument }) {
  const preview = usePreview(doc)
  if (preview.status !== "ready" || !preview.url) return <FileIcon extension={doc.extension} className="h-14 w-11 text-[10px]" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={preview.url} alt="" loading="lazy" className="h-20 w-full rounded-[6px] object-cover" />
}

/** Cartão da exibição em grade. */
function DocumentCard({
  doc: d,
  client,
  fresh,
  checked,
  active,
  onToggle,
  onOpen,
}: {
  doc: LegalDocument
  client?: Client
  fresh: boolean
  checked: boolean
  active: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  return (
    <li
      className={cn(
        "group relative flex flex-col rounded-card border bg-card shadow-card transition-[border-color,box-shadow]",
        active ? "border-brand/50 ring-2 ring-brand/15" : checked ? "border-brand/35" : "border-border hover:border-border-strong",
      )}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <input
          type="checkbox"
          aria-label={`Selecionar ${d.name}`}
          checked={checked}
          onChange={onToggle}
          className="relative z-10 size-4 cursor-pointer accent-[var(--brand)]"
        />
        <div className="relative z-10">
          <DocumentActions doc={d} />
        </div>
      </div>
      <div className="flex justify-center py-3">
        {(d.extension === "jpg" || d.extension === "png") && d.storagePath ? (
          <ImageThumb doc={d} />
        ) : (
          <FileIcon extension={d.extension} className="h-14 w-11 text-[10px]" />
        )}
      </div>
      <div className="min-w-0 border-t border-border/70 px-3 py-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="line-clamp-2 text-left text-[13px] leading-snug font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:after:ring-2 focus-visible:after:ring-brand/40"
        >
          {d.name}
        </button>
        <p className="mt-1 truncate text-[11.5px] text-muted-foreground">
          {fresh && <span className="mr-1 font-semibold text-brand-strong">Novo ·</span>}
          {d.kind} · {formatFileSize(d.sizeBytes)}
        </p>
        {client && <p className="truncate text-[11.5px] text-subtle">{client.name}</p>}
      </div>
    </li>
  )
}
