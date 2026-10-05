"use client"

import * as React from "react"
import Link from "next/link"
import { FilePlus, FolderOpen } from "lucide-react"
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
import { Can } from "@/lib/auth/session"

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
  const [filter, setFilter] = React.useState<Filter>("todos")
  const [clientId, setClientId] = React.useState("")
  const [query, setQuery] = React.useState("")
  const search = React.useDeferredValue(query)
  const term = useDebounced(query.trim())
  const listKey = `${filter}|${clientId}|${search}`

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
  const recentMatches = data.documents.filter((d) => inWindow(d) && test(filter, d.kind) && (!clientId || d.clientId === clientId)).length
  const history = usePagedHistory(historyList, bounds.documents, { auto: !!serverSearch || recentMatches < LIST_PAGE })
  // Só até onde a lista está completa (mais recentes primeiro, sem buracos).
  const shown = (d: (typeof data.documents)[number]) => history.cursor === null || uploadedKey(d) >= history.cursor

  const rows = data.documents
    .filter((d) => shown(d) && test(filter, d.kind) && (!clientId || d.clientId === clientId) && matchesQuery(d))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))

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
  const listTotal = search ? undefined : clientId ? (history.total !== undefined ? recentMatches + history.total : undefined) : kindCount(filter)
  const clientsWithDocuments = React.useMemo(
    () => new Set([...data.documents.map((d) => d.clientId), ...(stats?.clients ?? [])]),
    [data.documents, stats],
  )
  const isNew = (uploadedAt: string) => diffInDays(getNow(), parse(uploadedAt)) <= RECENT_DAYS
  const fresh = ready ? data.documents.filter((d) => isNew(d.uploadedAt)).length : 0

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

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs
          ariaLabel="Filtrar por tipo"
          layoutId="docs-filter"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, count: kindCount(f.value) }))}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="sm:w-[200px]">
            <NativeSelect aria-label="Filtrar por cliente" value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9 text-[13px]">
              <option value="">Todos os clientes</option>
              {data.clients
                .filter((c) => clientsWithDocuments.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <SearchField value={query} onChange={setQuery} placeholder="Buscar documento…" className="w-full sm:w-[260px]" />
        </div>
      </div>

      {!ready || (rows.length === 0 && history.loading) ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <TableShell>
          <EmptyState
            icon={<FolderOpen />}
            title={data.documents.length || totalCount ? "Nenhum documento com esses filtros." : "Nenhum documento ainda."}
            description={
              data.documents.length || totalCount
                ? "Ajuste o tipo, o cliente ou a busca."
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
          <LimitedList items={rows} listKey={listKey} server={history} total={listTotal}>
            {(visibleRows) => (
              <>
                {/* Tabela só com espaço para todas as colunas (≥ 896 px de conteúdo); antes disso, a lista em cartões. */}
                <TableShell className="hidden @4xl/main:block">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-separate border-spacing-0">
                      <thead>
                        <tr>
                          <Th>Nome</Th>
                          <Th>Cliente</Th>
                          <Th>Processo</Th>
                          <Th>Tipo</Th>
                          <Th>Data</Th>
                          <Th className="max-lg:hidden">Responsável</Th>
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
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TableShell>
                <div className="overflow-hidden rounded-card border border-border/90 bg-card shadow-card @4xl/main:hidden">
                  <DocumentList documents={visibleRows} showClient />
                </div>
              </>
            )}
          </LimitedList>
        </FadeIn>
      )}
    </div>
  )
}

/** Uma linha da tabela: só redesenha quando o próprio documento (ou seu cliente/processo) muda. */
const DocumentRow = React.memo(function DocumentRow({
  doc: d,
  client,
  process,
  fresh,
}: {
  doc: LegalDocument
  client?: Client
  process?: Process
  fresh: boolean
}) {
  const by = getUser(d.uploadedById)
  return (
    <tr className="transition-colors hover:bg-accent/40">
      <Td>
        <div className="flex items-center gap-3">
          <FileIcon extension={d.extension} className="h-9 w-7" />
          <div className="min-w-0">
            <p className="flex max-w-[300px] items-center gap-2 font-medium">
              <span className="truncate">{d.name}</span>
              {fresh && <span className="shrink-0 rounded-[5px] bg-brand-soft px-1.5 text-[10.5px] font-semibold text-brand-strong">Novo</span>}
            </p>
            <p className="text-[11.5px] text-subtle">{formatFileSize(d.sizeBytes)}</p>
          </div>
        </div>
      </Td>
      <Td>
        {client ? (
          <Link href={`/clientes/${client.id}?tab=documentos`} className="max-w-[160px] truncate text-foreground hover:underline">
            {client.name}
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </Td>
      <Td>
        {process ? (
          <Link href={`/processos/${process.id}`} className="font-mono text-[12px] text-muted-foreground hover:text-foreground hover:underline">
            {process.code}
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </Td>
      <Td className="text-muted-foreground">{d.kind}</Td>
      <Td className="tabular whitespace-nowrap text-muted-foreground">{fmtNumericDate(d.uploadedAt)}</Td>
      <Td className="max-lg:hidden">
        <span className="flex items-center gap-2 text-muted-foreground">
          <UserAvatar name={by.name} size="xs" />
          {by.firstName}
        </span>
      </Td>
      <Td>
        <DocumentActions doc={d} />
      </Td>
    </tr>
  )
})
