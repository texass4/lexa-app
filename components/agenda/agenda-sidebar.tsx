"use client"

import * as React from "react"
import { UserAvatar } from "@/components/ui/user-avatar"
import { MiniCalendar } from "./mini-calendar"
import { categoryStyle } from "@/lib/core/config"
import { personColor } from "@/lib/agenda/agenda"
import { currentUserId, getMembers } from "@/lib/auth/account"
import { cn } from "cn"
import type { ColorBy } from "./use-event-color"
import type { Appointment } from "@/types"

export interface SidebarLegendItem {
  key: string
  name: string
  color?: string
  count: number
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pb-1 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{children}</p>
}

/** Linha com caixa de seleção colorida (categoria, pessoa ou camada). */
function CheckRow({
  checked,
  onChange,
  color,
  count,
  children,
}: {
  checked: boolean
  onChange: () => void
  color?: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <label className="flex h-8 cursor-pointer items-center gap-2.5 rounded-control px-2 text-[13px] text-foreground transition-colors hover:bg-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 cursor-pointer rounded-[4px]"
        style={{ accentColor: color ?? "var(--subtle)" }}
      />
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      {count !== undefined && <span className="tabular text-[11.5px] text-subtle">{count}</span>}
    </label>
  )
}

/**
 * Barra lateral da Agenda: criar, minicalendário e os filtros — equipe (com as fotos),
 * categorias, camadas (prazos e tarefas) e como colorir.
 */
export function AgendaSidebar({
  selected,
  rangeStart,
  rangeEnd,
  visible,
  onPick,
  onlyMine,
  onOnlyMine,
  people,
  hiddenPeople,
  onTogglePerson,
  legend,
  hiddenCategories,
  onToggleCategory,
  layers,
  canSeeDeadlines,
  canSeeTasks,
  colorBy,
  onColorBy,
}: {
  selected: Date
  rangeStart: Date
  rangeEnd: Date
  visible: (a: Appointment) => boolean
  onPick: (d: Date) => void
  onlyMine: boolean
  onOnlyMine: () => void
  /** Pessoas da equipe com quantos compromissos têm no período. */
  people: { id: string; count: number }[]
  hiddenPeople: Set<string>
  onTogglePerson: (id: string) => void
  legend: SidebarLegendItem[]
  hiddenCategories: Set<string>
  onToggleCategory: (key: string) => void
  layers: { prazos: boolean; tarefas: boolean; toggle: (layer: "prazos" | "tarefas") => void }
  canSeeDeadlines: boolean
  canSeeTasks: boolean
  colorBy: ColorBy
  onColorBy: (v: ColorBy) => void
}) {
  const members = getMembers()
  const counts = new Map(people.map((p) => [p.id, p.count]))
  return (
    <aside className="hidden @5xl/main:block" aria-label="Navegação da agenda">
      <div className="sticky top-24 space-y-5">
        <MiniCalendar selected={selected} rangeStart={rangeStart} rangeEnd={rangeEnd} visible={visible} onPick={onPick} />

        <div className="space-y-0.5" role="group" aria-label="Equipe">
          <SectionTitle>Equipe</SectionTitle>
          <CheckRow checked={onlyMine} onChange={onOnlyMine} color="var(--brand)">
            Somente meus compromissos
          </CheckRow>
          <div className="max-h-[200px] overflow-y-auto thin-scrollbar">
            {members.map((m) => (
              <CheckRow
                key={m.id}
                checked={!hiddenPeople.has(m.id)}
                onChange={() => onTogglePerson(m.id)}
                color={personColor(m.id)}
                count={counts.get(m.id) ?? 0}
              >
                <UserAvatar name={m.name} src={m.avatarUrl} size="xs" />
                <span className="truncate">{m.id === currentUserId() ? `${m.firstName} (você)` : m.name}</span>
              </CheckRow>
            ))}
          </div>
        </div>

        {legend.length > 0 && (
          <div className="space-y-0.5" role="group" aria-label="Categorias">
            <SectionTitle>Categorias</SectionTitle>
            {legend.map((item) => (
              <CheckRow
                key={item.key}
                checked={!hiddenCategories.has(item.key)}
                onChange={() => onToggleCategory(item.key)}
                color={item.color}
                count={item.count}
              >
                <span className="size-2 shrink-0 rounded-full" style={categoryStyle(item.color).dot} />
                <span className="truncate">{item.name}</span>
              </CheckRow>
            ))}
          </div>
        )}

        {(canSeeDeadlines || canSeeTasks) && (
          <div className="space-y-0.5" role="group" aria-label="Camadas">
            <SectionTitle>Mostrar também</SectionTitle>
            {canSeeDeadlines && (
              <CheckRow checked={layers.prazos} onChange={() => layers.toggle("prazos")} color="var(--danger)">
                Prazos dos processos
              </CheckRow>
            )}
            {canSeeTasks && (
              <CheckRow checked={layers.tarefas} onChange={() => layers.toggle("tarefas")} color="var(--violet)">
                Tarefas
              </CheckRow>
            )}
          </div>
        )}

        <div role="radiogroup" aria-label="Colorir por" className="space-y-1">
          <SectionTitle>Colorir por</SectionTitle>
          <div className="mx-2 inline-flex rounded-full border border-border bg-surface-muted/60 p-0.5">
            {(["categoria", "advogado"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={colorBy === v}
                onClick={() => onColorBy(v)}
                className={cn(
                  "h-7 rounded-full px-3 text-[12px] font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                  colorBy === v ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
