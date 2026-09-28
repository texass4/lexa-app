"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, ChevronRight, Download, Ellipsis, Eye, Plus, Power, Trash2, UsersRound, X } from "lucide-react"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { NativeSelect } from "@/components/ui/field"
import { SkeletonTable } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { FadeIn } from "@/components/ui/motion"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useClientActions } from "./client-actions"
import { useUI } from "@/lib/store/ui-store"
import { CLIENT_STATUS, PRACTICE_AREAS } from "@/lib/config"
import { fmtNumericDate, fmtRelative } from "@/lib/dates"
import { matches } from "@/lib/format"
import { getMembers, getUser } from "@/lib/account"
import { onlyDigits } from "@/lib/clients"
import { delinquentClientIds, isOverdue, lastActivityByClient, relatedClientId } from "@/lib/selectors"
import { downloadFile, toCsv } from "@/lib/export"
import type { Client, ClientStatus, PracticeArea } from "@/types"
import { Can, useSession } from "@/lib/auth/session"

type Filter = "todos" | ClientStatus
const FILTERS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" },
  { value: "novo", label: "Novos" },
  { value: "inadimplente", label: "Inadimplentes" },
]

type Links = "" | "com-processos" | "sem-processos" | "tarefas-pendentes" | "tarefas-atrasadas"
const LINKS: { value: Links; label: string }[] = [
  { value: "", label: "Todos os vínculos" },
  { value: "com-processos", label: "Com processos ativos" },
  { value: "sem-processos", label: "Sem processos" },
  { value: "tarefas-pendentes", label: "Com tarefas pendentes" },
  { value: "tarefas-atrasadas", label: "Com tarefas atrasadas" },
]

type SortKey = "name" | "activity"
const PAGE_SIZE = 50

interface Row {
  client: Client
  activeProcesses: number
  totalProcesses: number
  pendingTasks: number
  overdueTasks: number
  lastActivity: string
  delinquent: boolean
}

export function ClientsView() {
  const data = useDemoData()
  const { deleteClient, retryLoad } = useDemoActions()
  const { toggleActive, deleteDescription } = useClientActions()
  const { openDialog } = useUI()
  const { can } = useSession()
  const router = useRouter()
  const ready = data.hydrated
  const [filter, setFilter] = React.useState<Filter>("todos")
  const [query, setQuery] = React.useState("")
  const [ownerId, setOwnerId] = React.useState("")
  const [area, setArea] = React.useState<PracticeArea | "">("")
  const [kind, setKind] = React.useState<Client["kind"] | "">("")
  const [links, setLinks] = React.useState<Links>("")
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "activity", dir: "desc" })
  const [limit, setLimit] = React.useState(PAGE_SIZE)
  const [toDelete, setToDelete] = React.useState<Client | null>(null)

  // Tudo o que a lista precisa de cada cliente, calculado uma vez por mudança nos dados.
  const rowsById = React.useMemo(() => {
    const last = lastActivityByClient(data)
    const delinquent = delinquentClientIds(data.invoices)
    const map = new Map<string, Row>()
    for (const client of data.clients) {
      map.set(client.id, {
        client,
        activeProcesses: 0,
        totalProcesses: 0,
        pendingTasks: 0,
        overdueTasks: 0,
        // Registro gravado fora do app pode vir sem datas — a lista não pode quebrar por isso.
        lastActivity: [last.get(client.id), client.updatedAt, client.lastActivityAt, client.createdAt].filter(Boolean).sort().pop() ?? "",
        delinquent: client.status === "inadimplente" || delinquent.has(client.id),
      })
    }
    for (const p of data.processes) {
      const row = map.get(p.clientId)
      if (!row) continue
      row.totalProcesses++
      if (p.status !== "concluido") row.activeProcesses++
    }
    for (const t of data.tasks) {
      if (t.status === "concluida") continue
      const row = map.get(relatedClientId(data, t.related) ?? "")
      if (!row) continue
      row.pendingTasks++
      if (isOverdue(t)) row.overdueTasks++
    }
    return map
  }, [data])

  // Busca também por número de processo (com ou sem máscara) e por CPF/telefone só com dígitos.
  const processText = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const p of data.processes) map.set(p.clientId, `${map.get(p.clientId) ?? ""} ${p.number} ${p.code} ${p.cnj ?? onlyDigits(p.number)}`)
    return map
  }, [data.processes])

  const searchable = React.useCallback(
    (c: Client) => {
      const q = query.trim()
      if (!q) return true
      const digits = onlyDigits(q)
      if (digits.length >= 3 && digits.length === q.replace(/[\s.\-/()]/g, "").length) {
        if ([c.document, c.phone, c.whatsapp].some((v) => onlyDigits(v).includes(digits))) return true
        if ((processText.get(c.id) ?? "").includes(digits)) return true
      }
      return matches(q, c.name, c.area, c.email, c.document, c.phone, c.whatsapp, c.contact?.name, processText.get(c.id), ...(c.tags ?? []))
    },
    [query, processText],
  )

  const testStatus = React.useCallback(
    (row: Row, f: Filter) => f === "todos" || (f === "inadimplente" ? row.delinquent : row.client.status === f),
    [],
  )

  const testLinks = (row: Row) =>
    links === "com-processos"
      ? row.activeProcesses > 0
      : links === "sem-processos"
        ? row.totalProcesses === 0
        : links === "tarefas-pendentes"
          ? row.pendingTasks > 0
          : links === "tarefas-atrasadas"
            ? row.overdueTasks > 0
            : true

  // Filtros além do status — os contadores das abas respeitam estes.
  const base = [...rowsById.values()].filter(
    (row) =>
      (!ownerId || row.client.ownerId === ownerId) &&
      (!area || row.client.area === area) &&
      (!kind || row.client.kind === kind) &&
      testLinks(row) &&
      searchable(row.client),
  )

  const rows = base
    .filter((row) => testStatus(row, filter))
    .sort((a, b) => {
      const r = sort.key === "name" ? (a.client.name ?? "").localeCompare(b.client.name ?? "", "pt-BR") : a.lastActivity.localeCompare(b.lastActivity)
      return sort.dir === "asc" ? r : -r
    })
  const visible = rows.slice(0, limit)

  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, base.filter((row) => testStatus(row, f.value)).length])) as Record<Filter, number>
  const extraFilters = !!(ownerId || area || kind || links)
  const clearFilters = () => {
    setOwnerId("")
    setArea("")
    setKind("")
    setLinks("")
    setQuery("")
    setFilter("todos")
  }

  // Mudou o filtro, volta para a primeira página.
  const filterKey = [filter, query, ownerId, area, kind, links].join("|")
  const [lastKey, setLastKey] = React.useState(filterKey)
  if (filterKey !== lastKey) {
    setLastKey(filterKey)
    setLimit(PAGE_SIZE)
  }

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }))
  const sortIcon = (k: SortKey) => (sort.key === k ? sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null)

  const exportCsv = () => {
    const csv = toCsv(
      [
        "Nome",
        "Tipo",
        "CPF/CNPJ",
        "E-mail",
        "Telefone",
        "WhatsApp",
        "Endereço",
        "Área",
        "Responsável",
        "Status",
        "Tags",
        "Processos ativos",
        "Cliente desde",
      ],
      rows.map(({ client: c, activeProcesses }) => [
        c.name,
        c.kind,
        c.document,
        c.email,
        c.phone,
        c.whatsapp,
        c.address,
        c.area,
        getUser(c.ownerId).name,
        CLIENT_STATUS[c.status].label,
        (c.tags ?? []).join(", "),
        activeProcesses,
        fmtNumericDate(c.clientSince),
      ]),
    )
    downloadFile(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8")
    toast.success("Lista exportada.", { description: `${rows.length} ${rows.length === 1 ? "cliente" : "clientes"} em CSV.` })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Tenha todas as informações do cliente em um único lugar."
        actions={
          <>
            {ready && data.clients.length > 0 && (
              <Button variant="secondary" onClick={exportCsv}>
                <Download /> Exportar
              </Button>
            )}
            <Can permission="clients.edit">
              <Button onClick={() => openDialog("client")}>
                <Plus /> Novo cliente
              </Button>
            </Can>
          </>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterTabs
            ariaLabel="Filtrar clientes"
            layoutId="clients-filter"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({ ...f, count: ready ? counts[f.value] : undefined }))}
          />
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Nome, CPF/CNPJ, e-mail, telefone ou processo…"
            className="w-full lg:w-[340px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <NativeSelect
            aria-label="Filtrar por responsável"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="h-9 text-[13px] sm:w-44"
          >
            <option value="">Todos os responsáveis</option>
            {getMembers({ includeInactive: true })
              .filter((m) => m.active || data.clients.some((c) => c.ownerId === m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filtrar por área"
            value={area}
            onChange={(e) => setArea(e.target.value as PracticeArea | "")}
            className="h-9 text-[13px] sm:w-40"
          >
            <option value="">Todas as áreas</option>
            {PRACTICE_AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filtrar por tipo"
            value={kind}
            onChange={(e) => setKind(e.target.value as Client["kind"] | "")}
            className="h-9 text-[13px] sm:w-40"
          >
            <option value="">PF e PJ</option>
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </NativeSelect>
          <NativeSelect
            aria-label="Filtrar por vínculos e pendências"
            value={links}
            onChange={(e) => setLinks(e.target.value as Links)}
            className="h-9 text-[13px] sm:w-52"
          >
            {LINKS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </NativeSelect>
          {extraFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="col-span-2 justify-self-start">
              <X /> Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {!ready && data.loadError ? (
        <TableShell>
          <ErrorState title="Não foi possível carregar os clientes." onRetry={retryLoad} />
        </TableShell>
      ) : !ready ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <TableShell>
          {data.clients.length === 0 ? (
            <EmptyState
              icon={<UsersRound />}
              title="Nenhum cliente cadastrado."
              description="Cadastre o primeiro cliente para vincular processos, tarefas, documentos e honorários."
              action={
                <Can permission="clients.edit">
                  <Button size="sm" onClick={() => openDialog("client")}>
                    <Plus /> Novo cliente
                  </Button>
                </Can>
              }
            />
          ) : (
            <EmptyState
              icon={<UsersRound />}
              title="Nenhum cliente encontrado."
              description={
                query ? `Não há clientes que correspondam a “${query}” com estes filtros.` : "Nenhum cliente corresponde aos filtros escolhidos."
              }
              action={
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              }
            />
          )}
        </TableShell>
      ) : (
        <FadeIn>
          {/* Desktop */}
          <TableShell className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <Th>
                      <button
                        type="button"
                        onClick={() => toggleSort("name")}
                        className="inline-flex items-center gap-1 outline-none hover:text-foreground focus-visible:text-foreground"
                      >
                        Cliente {sortIcon("name")}
                      </button>
                    </Th>
                    <Th>Tipo</Th>
                    <Th>Área</Th>
                    <Th className="text-center">Processos</Th>
                    <Th className="max-lg:hidden">Responsável</Th>
                    <Th>
                      <button
                        type="button"
                        onClick={() => toggleSort("activity")}
                        className="inline-flex items-center gap-1 outline-none hover:text-foreground focus-visible:text-foreground"
                      >
                        Última atividade {sortIcon("activity")}
                      </button>
                    </Th>
                    <Th>Status</Th>
                    <Th className="w-8" aria-label="Abrir" />
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child_td]:border-0">
                  {visible.map((row) => (
                    <ClientRow
                      key={row.client.id}
                      row={row}
                      showFinance={can("finance.view")}
                      onOpen={() => router.push(`/clientes/${row.client.id}`)}
                      onToggleActive={() => toggleActive(row.client)}
                      onDelete={() => setToDelete(row.client)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-surface-muted/30 px-5 py-2.5 text-[12px] text-muted-foreground">
              <span>
                {visible.length} de {rows.length} {rows.length === 1 ? "cliente" : "clientes"}
                {rows.length !== data.clients.length && ` · ${data.clients.length} no escritório`}
              </span>
              <span>Ordenado por {sort.key === "name" ? "nome" : "última atividade"}</span>
            </div>
          </TableShell>

          {/* Mobile */}
          <ul className="space-y-2.5 md:hidden">
            {visible.map(({ client: c, activeProcesses, lastActivity, delinquent }) => {
              const status = CLIENT_STATUS[c.status]
              return (
                <li key={c.id}>
                  <Link
                    href={`/clientes/${c.id}`}
                    className="flex items-center gap-3 rounded-[14px] border border-border bg-card p-3.5 shadow-card outline-none active:bg-accent/60 focus-visible:ring-2 focus-visible:ring-gold/40"
                  >
                    <UserAvatar name={c.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[14px] font-semibold">{c.name}</p>
                        <StatusBadge tone={delinquent && c.status !== "inativo" ? "danger" : status.tone} size="sm">
                          {delinquent && c.status !== "inativo" ? "Inadimplente" : status.label}
                        </StatusBadge>
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                        {c.kind} · {c.area} · {activeProcesses} {activeProcesses === 1 ? "processo" : "processos"}
                      </p>
                      <p className="mt-1 text-[11.5px] text-subtle">
                        {getUser(c.ownerId).firstName} · {lastActivity ? fmtRelative(lastActivity) : "—"}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>

          {rows.length > visible.length && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Mostrar mais {Math.min(PAGE_SIZE, rows.length - visible.length)}
              </Button>
            </div>
          )}
        </FadeIn>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir ${toDelete?.name}?`}
        description={toDelete ? deleteDescription(toDelete) : undefined}
        onConfirm={() => {
          if (!toDelete) return
          deleteClient(toDelete.id)
          toast.success("Cliente excluído.", { description: toDelete.name })
        }}
      />
    </div>
  )
}

function ClientRow({
  row,
  showFinance,
  onOpen,
  onToggleActive,
  onDelete,
}: {
  row: Row
  showFinance: boolean
  onOpen: () => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const { client: c, activeProcesses, totalProcesses, pendingTasks, overdueTasks, lastActivity, delinquent } = row
  const owner = getUser(c.ownerId)
  const status = CLIENT_STATUS[c.status]
  return (
    <tr onClick={onOpen} className="group cursor-pointer transition-colors hover:bg-accent/50">
      <Td>
        <div className="flex items-center gap-3">
          <UserAvatar name={c.name} />
          <div className="min-w-0">
            <Link
              href={`/clientes/${c.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-medium text-foreground outline-none hover:underline focus-visible:underline"
            >
              {c.name}
            </Link>
            <p className="truncate text-[12px] text-muted-foreground">{c.document || c.email || c.phone || "Sem documento"}</p>
          </div>
        </div>
      </Td>
      <Td className="text-muted-foreground">{c.kind}</Td>
      <Td className="text-muted-foreground">{c.area}</Td>
      <Td className="tabular text-center">
        <span
          title={`${activeProcesses} ativos de ${totalProcesses}`}
          className={cn(
            "inline-flex min-w-6 justify-center rounded-md px-1.5 py-0.5 text-[12px] font-medium",
            activeProcesses ? "bg-surface-muted text-foreground" : "text-subtle",
          )}
        >
          {activeProcesses}
        </span>
      </Td>
      <Td className="max-lg:hidden">
        <span className="flex items-center gap-2 text-muted-foreground">
          <UserAvatar name={owner.name} size="xs" />
          {owner.firstName}
        </span>
      </Td>
      <Td className="whitespace-nowrap text-muted-foreground">
        {lastActivity ? fmtRelative(lastActivity) : "—"}
        {pendingTasks > 0 && (
          <span className={cn("block text-[11.5px]", overdueTasks ? "text-danger" : "text-subtle")}>
            {overdueTasks
              ? `${overdueTasks} tarefa${overdueTasks > 1 ? "s" : ""} atrasada${overdueTasks > 1 ? "s" : ""}`
              : `${pendingTasks} pendente${pendingTasks > 1 ? "s" : ""}`}
          </span>
        )}
      </Td>
      <Td>
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {showFinance && delinquent && c.status !== "inadimplente" && (
            <StatusBadge tone="danger" size="sm" dot={false}>
              Em atraso
            </StatusBadge>
          )}
        </div>
      </Td>
      <Td>
        <div className="flex items-center justify-end gap-1">
          <ChevronRight className="size-4 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Ações para ${c.name}`}
              onClick={(e) => e.stopPropagation()}
              className="-my-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-accent"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-[10px] p-1" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuGroup>
                <DropdownMenuItem className="h-8 px-2" onClick={onOpen}>
                  <Eye /> Abrir perfil
                </DropdownMenuItem>
                <Can permission="clients.edit">
                  <DropdownMenuItem className="h-8 px-2" onClick={onToggleActive}>
                    <Power /> {c.status === "inativo" ? "Reativar" : "Desativar"}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={onDelete}>
                    <Trash2 /> Excluir cliente
                  </DropdownMenuItem>
                </Can>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Td>
    </tr>
  )
}
