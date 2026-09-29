"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { CalendarRange, Hourglass, ListX, Plus, TriangleAlert } from "lucide-react"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { NativeSelect } from "@/components/ui/field"
import { SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { MiniStat } from "@/components/shared/mini-stat"
import { Can } from "@/lib/auth/session"
import { getMembers } from "@/lib/account"
import { getNow } from "@/lib/dates"
import { matches } from "@/lib/format"
import { PRAZO_PERIOD_LABEL, daysToPrazo, isOpenPrazo, prazoPeriod, prazoTask, type PrazoPeriod } from "@/lib/prazos"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import type { Prazo } from "@/types"
import { PrazoRow } from "./prazos-panel"

type Filter = "abertos" | "vencidos" | "semana" | "30dias" | "sem-tarefa" | "cumpridos" | "perdidos"

const FILTERS: Filter[] = ["abertos", "vencidos", "semana", "30dias", "sem-tarefa", "cumpridos", "perdidos"]
const PERIODS: PrazoPeriod[] = ["vencido", "hoje", "semana", "proxima", "depois"]

const byFatal = (a: Prazo, b: Prazo) => a.fatalDate.localeCompare(b.fatalDate) || a.description.localeCompare(b.description)

/** Panorama dos prazos do escritório: o que venceu, o que vence até domingo e adiante, por responsável. */
export function PrazosView() {
  const data = useDemoData()
  const { openDialog } = useUI()
  const param = useSearchParams().get("filtro") as Filter | null
  const [filter, setFilter] = React.useState<Filter>(() => (param && FILTERS.includes(param) ? param : "abertos"))
  const [responsible, setResponsible] = React.useState("")
  const [query, setQuery] = React.useState("")

  if (!data.hydrated) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando prazos">
        <SkeletonStats />
        <SkeletonCard lines={6} />
      </div>
    )
  }

  const now = getNow()
  const processOf = (p: Prazo) => data.processes.find((x) => x.id === p.processId)
  const clientName = (p: Prazo) => data.clients.find((c) => c.id === processOf(p)?.clientId)?.name
  const scoped = data.deadlines.filter(
    (p) =>
      (!responsible || p.responsibleId === responsible) && matches(query, p.description, processOf(p)?.code, processOf(p)?.number, clientName(p)),
  )
  const open = scoped.filter(isOpenPrazo)

  const test: Record<Filter, (p: Prazo) => boolean> = {
    abertos: isOpenPrazo,
    vencidos: (p) => isOpenPrazo(p) && prazoPeriod(p, now) === "vencido",
    semana: (p) => isOpenPrazo(p) && ["hoje", "semana"].includes(prazoPeriod(p, now)),
    "30dias": (p) => isOpenPrazo(p) && daysToPrazo(p, now) >= 0 && daysToPrazo(p, now) <= 30,
    "sem-tarefa": (p) => isOpenPrazo(p) && !prazoTask(p, data.tasks),
    cumpridos: (p) => p.status === "cumprido",
    perdidos: (p) => p.status === "perdido",
  }
  const count = (f: Filter) => scoped.filter(test[f]).length
  const visible = scoped.filter(test[filter])
  const closed = filter === "cumpridos" || filter === "perdidos"

  // Abertos: agrupados por período. Encerrados: os mais recentes primeiro.
  const groups = closed
    ? [
        {
          id: filter,
          label: filter === "cumpridos" ? "Cumpridos" : "Perdidos",
          items: [...visible].sort((a, b) => (b.closedAt ?? b.fatalDate).localeCompare(a.closedAt ?? a.fatalDate)),
        },
      ]
    : PERIODS.map((period) => ({
        id: period,
        label: PRAZO_PERIOD_LABEL[period],
        items: visible.filter((p) => prazoPeriod(p, now) === period).sort(byFatal),
      })).filter((g) => g.items.length > 0)

  const overdue = open.filter((p) => prazoPeriod(p, now) === "vencido").length
  const thisWeek = open.filter((p) => ["hoje", "semana"].includes(prazoPeriod(p, now))).length
  const next30 = open.filter((p) => daysToPrazo(p, now) >= 0 && daysToPrazo(p, now) <= 30).length
  const noTask = open.filter((p) => !prazoTask(p, data.tasks)).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prazos"
        description={
          open.length
            ? `${open.length} ${open.length === 1 ? "prazo aberto" : "prazos abertos"}${overdue ? ` — ${overdue} vencido${overdue > 1 ? "s" : ""}. Comece por ${overdue > 1 ? "eles" : "ele"}.` : "."}`
            : "Nenhum prazo aberto. Os prazos cadastrados nos processos aparecem aqui."
        }
        actions={
          <Can permission="processes.edit">
            <Button onClick={() => openDialog("prazo")}>
              <Plus /> Novo prazo
            </Button>
          </Can>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatButton label="Ver prazos vencidos" onClick={() => setFilter("vencidos")}>
          <MiniStat
            label="Vencidos"
            value={String(overdue).padStart(2, "0")}
            hint="Abertos e já passaram"
            icon={<TriangleAlert />}
            tone={overdue ? "danger" : undefined}
          />
        </StatButton>
        <StatButton label="Ver prazos até domingo" onClick={() => setFilter("semana")}>
          <MiniStat label="Até domingo" value={String(thisWeek).padStart(2, "0")} hint="Vencem nesta semana" icon={<Hourglass />} />
        </StatButton>
        <StatButton label="Ver prazos dos próximos 30 dias" onClick={() => setFilter("30dias")}>
          <MiniStat label="Próximos 30 dias" value={String(next30).padStart(2, "0")} hint="A partir de hoje" icon={<CalendarRange />} />
        </StatButton>
        <StatButton label="Ver prazos sem tarefa" onClick={() => setFilter("sem-tarefa")}>
          <MiniStat label="Sem tarefa" value={String(noTask).padStart(2, "0")} hint="Abertos sem tarefa vinculada" icon={<ListX />} />
        </StatButton>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          ariaLabel="Filtrar prazos"
          layoutId="prazos-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "abertos", label: "Abertos", count: count("abertos") },
            { value: "vencidos", label: "Vencidos", count: count("vencidos") },
            { value: "semana", label: "Até domingo", count: count("semana") },
            { value: "30dias", label: "30 dias", count: count("30dias") },
            { value: "sem-tarefa", label: "Sem tarefa", count: count("sem-tarefa") },
            { value: "cumpridos", label: "Cumpridos", count: count("cumpridos") },
            { value: "perdidos", label: "Perdidos", count: count("perdidos") },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <NativeSelect aria-label="Responsável" value={responsible} onChange={(e) => setResponsible(e.target.value)} className="sm:w-[200px]">
            <option value="">Todos os responsáveis</option>
            {getMembers().map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
          <SearchField value={query} onChange={setQuery} placeholder="Buscar prazo, processo ou cliente…" className="w-full sm:w-[280px]" />
        </div>
      </div>

      {groups.length ? (
        <div className="space-y-5">
          {groups.map((group) => (
            <Panel key={group.id}>
              <PanelHeader title={group.label} description={`${group.items.length} ${group.items.length === 1 ? "prazo" : "prazos"}`} />
              <ul className="divide-y divide-border px-3 pb-2">
                {group.items.map((p) => (
                  <PrazoRow key={p.id} prazo={p} showProcess />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState
            icon={<Hourglass />}
            title={data.deadlines.length ? "Nenhum prazo neste filtro." : "Nenhum prazo cadastrado."}
            description={
              data.deadlines.length
                ? "Troque o filtro, o responsável ou a busca para ver outros prazos."
                : "Cadastre prazos pelo perfil do processo ou pelo botão Novo prazo."
            }
          />
        </Panel>
      )}
    </div>
  )
}

function StatButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-[14px] text-left outline-none transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      {children}
    </button>
  )
}
