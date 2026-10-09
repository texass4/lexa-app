"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ChevronRight, Ellipsis, Eye, FileSearch, Plus, Scale, Trash2 } from "lucide-react"
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
import { ShowMore, useRenderLimit } from "@/components/ui/show-more"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DeadlineLabel } from "./deadline-label"
import { StartConsultaDialog, useStartConsulta } from "./consulta/start-consulta"
import { SignalDot } from "@/components/shared/signal-list"
import { processSignals, type AttentionSignal } from "@/lib/dashboard/attention"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useUI } from "@/lib/store/ui-store"
import { PROCESS_STATUS } from "@/lib/core/config"
import { getNow, diffInDays, parse } from "@/lib/core/dates"
import { matches } from "@/lib/core/format"
import { getUser } from "@/lib/auth/account"
import { nextPrazo } from "@/lib/prazos/prazos"
import { byId } from "@/lib/store/indexes"
import type { Process, ProcessStatus } from "@/types"
import { Can } from "@/lib/auth/session"
import { hasValidCheckDigits, onlyDigits } from "@/lib/processos/cnj"

/** Processo com número CNJ válido (a consulta pública precisa dele). */
const hasCnj = (p: Process) => {
  const digits = p.cnj ?? onlyDigits(p.number ?? "")
  return digits.length === 20 && hasValidCheckDigits(digits)
}

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

/** Linha discreta com o principal sinal do processo — só quando existe. */
function SignalHint({ signal }: { signal?: AttentionSignal }) {
  if (!signal) return null
  return (
    <p className="mt-1 flex max-w-[280px] items-center gap-1.5 text-[11.5px] text-muted-foreground">
      <SignalDot level={signal.level} className="size-1.5 [&>span]:size-1.5" />
      <span className="truncate">{signal.title}</span>
    </p>
  )
}

export function ProcessesView() {
  const data = useOfficeData()
  const { deleteProcess } = useOfficeActions()
  const consulta = useStartConsulta()
  const [consultaOpen, setConsultaOpen] = React.useState(false)
  const { openDialog } = useUI()
  const router = useRouter()
  // Os dados vêm do armazenamento do navegador depois da hidratação.
  const ready = data.hydrated
  // `?filtro=prazos` vem dos sinais de atenção ("3 prazos nesta semana").
  const filterParam = useSearchParams().get("filtro")
  const [filter, setFilter] = React.useState<Filter>(() => (filterParam === "prazos" ? "prazos" : "todos"))
  const [query, setQuery] = React.useState("")
  // A busca filtra milhares de processos: o campo responde na hora e a lista acompanha.
  const search = React.useDeferredValue(query)
  const [toDelete, setToDelete] = React.useState<Process | null>(null)
  const [limit, showMore] = useRenderLimit(`${filter}|${search}`)

  const clientName = React.useCallback((id: string) => byId(data.clients, id)?.name ?? "", [data.clients])

  // Próximo prazo aberto de cada processo (os prazos são a fonte de verdade).
  const nextOf = React.useMemo(() => {
    const map = new Map<string, NonNullable<ReturnType<typeof nextPrazo>>>()
    for (const p of data.processes) {
      const next = p.status === "concluido" ? undefined : nextPrazo(data.deadlines, p.id)
      if (next) map.set(p.id, next)
    }
    return map
  }, [data.processes, data.deadlines])

  const test = React.useCallback(
    (f: Filter, p: Process) => {
      if (f === "todos") return true
      if (f === "prazos") {
        const next = nextOf.get(p.id)
        return !!next && diffInDays(parse(next.fatalDate), getNow()) <= 7
      }
      return p.status === f
    },
    [nextOf],
  )

  const rows = React.useMemo(
    () =>
      data.processes
        .filter((p) => test(filter, p) && matches(search, p.number, p.code, p.type, p.area, clientName(p.clientId), p.opposingParty))
        .sort((a, b) => {
          if (a.status === "concluido" && b.status !== "concluido") return 1
          if (b.status === "concluido" && a.status !== "concluido") return -1
          return (nextOf.get(a.id)?.fatalDate ?? "9999").localeCompare(nextOf.get(b.id)?.fatalDate ?? "9999")
        }),
    [data.processes, filter, search, test, clientName, nextOf],
  )
  // Desenha os processos aos poucos (a busca e os filtros valem para todos).
  const visible = React.useMemo(() => rows.slice(0, limit), [rows, limit])

  // O sinal mais importante de cada processo na tela (prazo, movimentação, parado) — sem IA, só dados.
  const topSignal = React.useMemo(() => {
    const map = new Map<string, AttentionSignal>()
    if (!ready) return map
    for (const p of visible) {
      const first = processSignals(data, p)[0]
      if (first) map.set(p.id, first)
    }
    return map
  }, [data, ready, visible])

  const counts = React.useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.value, data.processes.filter((p) => test(f.value, p)).length])) as Record<Filter, number>,
    [data.processes, test],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processos"
        description="Acompanhe prazos, audiências e movimentações de cada processo do escritório."
        actions={
          <Can permission="processes.edit">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setConsultaOpen(true)}>
                <FileSearch /> Consultar processo
              </Button>
              <Button onClick={() => openDialog("process")}>
                <Plus /> Novo processo
              </Button>
            </div>
          </Can>
        }
      />

      {/* Até 7 abas com contagem: abaixo de 2xl a busca vai para a linha de baixo, para nenhuma aba ser cortada. */}
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
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
        <SearchField value={query} onChange={setQuery} placeholder="Número, cliente ou parte contrária…" className="w-full sm:max-w-sm 2xl:w-[300px]" />
      </div>

      {!ready ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <TableShell>
          <EmptyState
            icon={<Scale />}
            title={data.processes.length ? "Nenhum processo com esses filtros." : "Seu escritório ainda não possui processos."}
            description={
              data.processes.length
                ? "Ajuste o filtro ou a busca."
                : "Consulte pelo número CNJ em “Novo processo”. A Íntegra passa a acompanhar as movimentações e destaca o que merece atenção."
            }
            action={
              <Can permission="processes.edit">
                <Button size="sm" onClick={() => openDialog("process")}>
                  <Plus /> Adicionar processo
                </Button>
              </Can>
            }
          />
        </TableShell>
      ) : (
        <FadeIn>
          {/* Tabela só com espaço para todas as colunas (≥ 896 px de conteúdo); antes disso, a lista em cartões. */}
          <TableShell className="hidden @4xl/main:block">
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
                  {visible.map((p) => {
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
                            {p.number || "Sem número"}
                          </Link>
                          <p className="mt-0.5 max-w-[280px] truncate text-[12px] text-muted-foreground">
                            <span className="text-subtle">{p.code}</span> · {p.type}
                          </p>
                          <SignalHint signal={topSignal.get(p.id)} />
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
                          <DeadlineLabel date={nextOf.get(p.id)?.fatalDate} />
                        </Td>
                        <Td>
                          <div className="flex items-center justify-end gap-1">
                            <ChevronRight className="size-4 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                aria-label={`Ações para o processo ${p.number || p.code}`}
                                onClick={(e) => e.stopPropagation()}
                                className="-my-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:bg-accent"
                              >
                                <Ellipsis className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-[10px] p-1" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuGroup>
                                  <DropdownMenuItem className="h-8 px-2" onClick={() => router.push(`/processos/${p.id}`)}>
                                    <Eye /> Abrir processo
                                  </DropdownMenuItem>
                                  <Can permission="processes.edit">
                                    {hasCnj(p) && (
                                      <DropdownMenuItem className="h-8 px-2" disabled={consulta.pending} onClick={() => consulta.start({ processId: p.id })}>
                                        <FileSearch /> Consultar processo
                                      </DropdownMenuItem>
                                    )}
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
              {visible.length < rows.length
                ? `${visible.length} de ${rows.length} processos encontrados`
                : `${rows.length} de ${data.processes.length} processos`}{" "}
              · ordenados pelo próximo prazo
            </div>
          </TableShell>

          <ul className="space-y-2.5 @4xl/main:hidden">
            {visible.map((p) => {
              const status = PROCESS_STATUS[p.status]
              return (
                <li key={p.id}>
                  <Link
                    href={`/processos/${p.id}`}
                    className="block rounded-card border border-border/90 bg-card p-4 shadow-card outline-none active:bg-accent/60 focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[12px] font-medium text-foreground">{p.number || "Sem número"}</p>
                        <p className="mt-1 truncate text-[14px] font-semibold">{clientName(p.clientId) || "Sem cliente"}</p>
                        <p className="truncate text-[12.5px] text-muted-foreground">{p.type}</p>
                        <SignalHint signal={topSignal.get(p.id)} />
                      </div>
                      <StatusBadge tone={status.tone} size="sm">
                        {status.label}
                      </StatusBadge>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-dashed border-border pt-3 text-[12px] text-muted-foreground">
                      <span>
                        {p.area} · {getUser(p.ownerId).firstName}
                      </span>
                      {nextOf.get(p.id) ? (
                        <span className="flex items-center gap-1.5">
                          Prazo <DeadlineLabel date={nextOf.get(p.id)!.fatalDate} compact />
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
          {rows.length > visible.length && <ShowMore remaining={rows.length - visible.length} onClick={showMore} />}
        </FadeIn>
      )}

      <StartConsultaDialog open={consultaOpen} onOpenChange={setConsultaOpen} />
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
