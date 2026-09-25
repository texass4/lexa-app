"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronRight, Ellipsis, Eye, Plus, Scale, Trash2 } from "lucide-react"
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
import { DeadlineLabel } from "./deadline-label"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { PROCESS_STATUS } from "@/lib/config"
import { getNow, diffInDays, parse } from "@/lib/dates"
import { matches } from "@/lib/format"
import { getUser } from "@/lib/account"
import type { Process, ProcessStatus } from "@/types"
import { Can } from "@/lib/auth/session"

type Filter = "todos" | "prazos" | ProcessStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "prazos", label: "Prazos da semana" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "audiencia", label: "Audiência" },
  { value: "aguardando_documento", label: "Aguardando documento" },
  { value: "recurso", label: "Em recurso" },
  { value: "concluido", label: "Concluídos" },
]

export function ProcessesView() {
  const data = useDemoData()
  const { deleteProcess } = useDemoActions()
  const { openDialog } = useUI()
  const router = useRouter()
  // Os dados vêm do armazenamento do navegador depois da hidratação.
  const ready = data.hydrated
  const [filter, setFilter] = React.useState<Filter>("todos")
  const [query, setQuery] = React.useState("")
  const [toDelete, setToDelete] = React.useState<Process | null>(null)

  const clientName = React.useCallback((id: string) => data.clients.find((c) => c.id === id)?.name ?? "", [data.clients])

  const test = React.useCallback((f: Filter, p: Process) => {
    if (f === "todos") return true
    if (f === "prazos") return !!p.nextDeadline && diffInDays(parse(p.nextDeadline.date), getNow()) <= 7
    return p.status === f
  }, [])

  const rows = React.useMemo(
    () =>
      data.processes
        .filter((p) => test(filter, p) && matches(query, p.number, p.code, p.type, p.area, clientName(p.clientId), p.opposingParty))
        .sort((a, b) => {
          if (a.status === "concluido" && b.status !== "concluido") return 1
          if (b.status === "concluido" && a.status !== "concluido") return -1
          return (a.nextDeadline?.date ?? "9999").localeCompare(b.nextDeadline?.date ?? "9999")
        }),
    [data.processes, filter, query, test, clientName],
  )

  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, data.processes.filter((p) => test(f.value, p)).length])) as Record<Filter, number>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processos"
        description="Acompanhe prazos, audiências e movimentações de cada processo do escritório."
        actions={
          <Can permission="processes.edit">
            <Button onClick={() => openDialog("process")}>
              <Plus /> Novo processo
            </Button>
          </Can>
        }
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs
          ariaLabel="Filtrar processos"
          layoutId="process-filter"
          value={filter}
          onChange={setFilter}
          options={FILTERS.filter((f) => f.value === "todos" || counts[f.value] > 0 || f.value === filter).map((f) => ({
            ...f,
            count: counts[f.value],
          }))}
        />
        <SearchField value={query} onChange={setQuery} placeholder="Número, cliente ou parte contrária…" className="w-full xl:w-[300px]" />
      </div>

      {!ready ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <TableShell>
          <EmptyState
            icon={<Scale />}
            title={data.processes.length ? "Nenhum processo encontrado." : "Nenhum processo ainda."}
            description={
              data.processes.length
                ? "Ajuste o filtro ou a busca."
                : "Consulte um processo pelo número CNJ em “Novo processo”: ele fica salvo aqui automaticamente."
            }
            action={
              <Can permission="processes.edit">
                <Button size="sm" onClick={() => openDialog("process")}>
                  <Plus /> Novo processo
                </Button>
              </Can>
            }
          />
        </TableShell>
      ) : (
        <FadeIn>
          <TableShell className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <Th>Processo</Th>
                    <Th>Cliente</Th>
                    <Th className="max-lg:hidden">Área</Th>
                    <Th>Status</Th>
                    <Th>Responsável</Th>
                    <Th>Próximo prazo</Th>
                    <Th className="w-8" aria-label="Abrir" />
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child_td]:border-0">
                  {rows.map((p) => {
                    const status = PROCESS_STATUS[p.status]
                    const owner = getUser(p.ownerId)
                    const client = clientName(p.clientId)
                    return (
                      <tr
                        key={p.id}
                        onClick={() => router.push(`/processos/${p.id}`)}
                        className="group cursor-pointer transition-colors hover:bg-accent/50"
                      >
                        <Td>
                          <Link
                            href={`/processos/${p.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block font-mono text-[12.5px] font-medium tracking-tight text-foreground outline-none hover:underline focus-visible:underline"
                          >
                            {p.number}
                          </Link>
                          <p className="mt-0.5 max-w-[280px] truncate text-[12px] text-muted-foreground">
                            <span className="text-subtle">{p.code}</span> · {p.type}
                          </p>
                        </Td>
                        <Td>
                          {client ? (
                            <Link
                              href={`/clientes/${p.clientId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-2 font-medium outline-none hover:underline focus-visible:underline"
                            >
                              <UserAvatar name={client} size="sm" />
                              <span className="max-w-[160px] truncate">{client}</span>
                            </Link>
                          ) : (
                            <span className="text-subtle">Sem cliente</span>
                          )}
                        </Td>
                        <Td className="text-muted-foreground max-lg:hidden">{p.area}</Td>
                        <Td>
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        </Td>
                        <Td className="text-muted-foreground">{owner.firstName}</Td>
                        <Td>
                          <DeadlineLabel date={p.status === "concluido" ? undefined : p.nextDeadline?.date} />
                        </Td>
                        <Td>
                          <div className="flex items-center justify-end gap-1">
                            <ChevronRight className="size-4 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                aria-label={`Ações para o processo ${p.number}`}
                                onClick={(e) => e.stopPropagation()}
                                className="-my-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-accent"
                              >
                                <Ellipsis className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44 rounded-[10px] p-1" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuGroup>
                                  <DropdownMenuItem className="h-8 px-2" onClick={() => router.push(`/processos/${p.id}`)}>
                                    <Eye /> Abrir processo
                                  </DropdownMenuItem>
                                  <Can permission="processes.edit">
                                    <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => setToDelete(p)}>
                                      <Trash2 /> Excluir processo
                                    </DropdownMenuItem>
                                  </Can>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-surface-muted/30 px-5 py-2.5 text-[12px] text-muted-foreground">
              {rows.length} de {data.processes.length} processos · ordenados pelo próximo prazo
            </div>
          </TableShell>

          <ul className="space-y-2.5 md:hidden">
            {rows.map((p) => {
              const status = PROCESS_STATUS[p.status]
              return (
                <li key={p.id}>
                  <Link
                    href={`/processos/${p.id}`}
                    className="block rounded-[14px] border border-border bg-card p-4 shadow-card outline-none active:bg-accent/60 focus-visible:ring-2 focus-visible:ring-gold/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[12px] font-medium text-foreground">{p.number}</p>
                        <p className="mt-1 truncate text-[14px] font-semibold">{clientName(p.clientId) || "Sem cliente"}</p>
                        <p className="truncate text-[12.5px] text-muted-foreground">{p.type}</p>
                      </div>
                      <StatusBadge tone={status.tone} size="sm">
                        {status.label}
                      </StatusBadge>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-dashed border-border pt-3 text-[12px] text-muted-foreground">
                      <span>
                        {p.area} · {getUser(p.ownerId).firstName}
                      </span>
                      {p.nextDeadline && p.status !== "concluido" ? (
                        <span className="flex items-center gap-1.5">
                          Prazo <DeadlineLabel date={p.nextDeadline.date} compact />
                        </span>
                      ) : (
                        <span className="text-subtle">Sem prazos</span>
                      )}
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
        title={`Excluir o processo ${toDelete?.number}?`}
        description="Esta ação não pode ser desfeita, incluindo o histórico de movimentações."
        onConfirm={() => {
          if (!toDelete) return
          deleteProcess(toDelete.id)
          toast.success("Processo excluído.", { description: toDelete.number })
        }}
      />
    </div>
  )
}
