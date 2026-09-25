"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, ChevronRight, Ellipsis, Eye, Plus, Trash2, UsersRound } from "lucide-react"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { FadeIn } from "@/components/ui/motion"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { CLIENT_STATUS } from "@/lib/config"
import { fmtRelative } from "@/lib/dates"
import { matches } from "@/lib/format"
import { getUser } from "@/lib/account"
import type { Client, ClientStatus } from "@/types"
import { Can } from "@/lib/auth/session"

type Filter = "todos" | ClientStatus
const FILTERS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" },
  { value: "novo", label: "Novo" },
  { value: "inadimplente", label: "Inadimplente" },
]

type SortKey = "name" | "activity"

export function ClientsView() {
  const data = useDemoData()
  const { deleteClient } = useDemoActions()
  const { openDialog } = useUI()
  const router = useRouter()
  const ready = data.hydrated
  const [filter, setFilter] = React.useState<Filter>("todos")
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "activity", dir: "desc" })
  const [toDelete, setToDelete] = React.useState<Client | null>(null)

  const processCount = React.useMemo(() => {
    const map = new Map<string, number>()
    data.processes.forEach((p) => {
      if (p.status !== "concluido") map.set(p.clientId, (map.get(p.clientId) ?? 0) + 1)
    })
    return map
  }, [data.processes])

  const rows = React.useMemo(() => {
    const list = data.clients.filter(
      (c) => (filter === "todos" || c.status === filter) && matches(query, c.name, c.area, c.email, c.document, c.phone),
    )
    return list.sort((a, b) => {
      const r = sort.key === "name" ? a.name.localeCompare(b.name, "pt-BR") : a.lastActivityAt.localeCompare(b.lastActivityAt)
      return sort.dir === "asc" ? r : -r
    })
  }, [data.clients, filter, query, sort])

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.value, f.value === "todos" ? data.clients.length : data.clients.filter((c) => c.status === f.value).length]),
  ) as Record<Filter, number>

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }))

  const sortIcon = (k: SortKey) => (sort.key === k ? sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Tenha todas as informações do cliente em um único lugar."
        actions={
          <Can permission="clients.edit">
            <Button onClick={() => openDialog("client")}>
              <Plus /> Novo cliente
            </Button>
          </Can>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          ariaLabel="Filtrar clientes"
          layoutId="clients-filter"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
        />
        <SearchField value={query} onChange={setQuery} placeholder="Buscar por nome, CPF, e-mail…" className="w-full lg:w-[300px]" />
      </div>

      {!ready ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <TableShell>
          <EmptyState
            icon={<UsersRound />}
            title="Nenhum cliente encontrado."
            description={query ? `Não há clientes que correspondam a “${query}”.` : "Não há clientes com este status no momento."}
            action={
              <Can permission="clients.edit">
                <Button size="sm" onClick={() => openDialog("client")}>
                  <Plus /> Novo cliente
                </Button>
              </Can>
            }
          />
        </TableShell>
      ) : (
        <FadeIn>
          {/* Desktop */}
          <TableShell className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0">
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
                  {rows.map((c) => (
                    <ClientRow
                      key={c.id}
                      client={c}
                      processes={processCount.get(c.id) ?? 0}
                      onOpen={() => router.push(`/clientes/${c.id}`)}
                      onDelete={() => setToDelete(c)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-surface-muted/30 px-5 py-2.5 text-[12px] text-muted-foreground">
              <span>
                {rows.length} de {data.clients.length} clientes
              </span>
              <span>Ordenado por {sort.key === "name" ? "nome" : "última atividade"}</span>
            </div>
          </TableShell>

          {/* Mobile */}
          <ul className="space-y-2.5 md:hidden">
            {rows.map((c) => {
              const status = CLIENT_STATUS[c.status]
              const n = processCount.get(c.id) ?? 0
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
                        <StatusBadge tone={status.tone} size="sm">
                          {status.label}
                        </StatusBadge>
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                        {c.area} · {n} {n === 1 ? "processo" : "processos"}
                      </p>
                      <p className="mt-1 text-[11.5px] text-subtle">
                        {getUser(c.ownerId).firstName} · {fmtRelative(c.lastActivityAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </FadeIn>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir ${toDelete?.name}?`}
        description="Esta ação não pode ser desfeita. Processos, documentos e tarefas vinculados a este cliente deixam de mostrar o nome dele."
        onConfirm={() => {
          if (!toDelete) return
          deleteClient(toDelete.id)
          toast.success("Cliente excluído.", { description: toDelete.name })
        }}
      />
    </div>
  )
}

function ClientRow({ client: c, processes, onOpen, onDelete }: { client: Client; processes: number; onOpen: () => void; onDelete: () => void }) {
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
            <p className="truncate text-[12px] text-muted-foreground">{c.kind === "PJ" ? `CNPJ ${c.document}` : c.email}</p>
          </div>
        </div>
      </Td>
      <Td className="text-muted-foreground">{c.area}</Td>
      <Td className="tabular text-center">
        <span
          className={cn(
            "inline-flex min-w-6 justify-center rounded-md px-1.5 py-0.5 text-[12px] font-medium",
            processes ? "bg-surface-muted text-foreground" : "text-subtle",
          )}
        >
          {processes}
        </span>
      </Td>
      <Td className="max-lg:hidden">
        <span className="flex items-center gap-2 text-muted-foreground">
          <UserAvatar name={owner.name} size="xs" />
          {owner.firstName}
        </span>
      </Td>
      <Td className="whitespace-nowrap text-muted-foreground">{fmtRelative(c.lastActivityAt)}</Td>
      <Td>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
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
