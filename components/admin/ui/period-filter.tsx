"use client"

import * as React from "react"
import { CalendarRange } from "lucide-react"
import { cn } from "cn"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { getNow } from "@/lib/dates"
import { PERIODS, resolvePeriod, type PeriodKey } from "@/lib/admin/catalog"

export interface PeriodState {
  key: PeriodKey
  customFrom: string
  customTo: string
  /** Intervalo resolvido [from, to) em ISO — calculado só quando o filtro muda. */
  from: string
  to: string
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function compute(key: PeriodKey, customFrom: string, customTo: string): PeriodState {
  const r = resolvePeriod(key, getNow(), { from: customFrom, to: customTo })
  return { key, customFrom, customTo, from: r.from.toISOString(), to: r.to.toISOString() }
}

/** Período do filtro (padrão: 30 dias). `query` vai direto na URL da API. */
export function usePeriod(initial: PeriodKey = "30d") {
  const [state, setState] = React.useState<PeriodState>(() => {
    const now = getNow()
    return compute(initial, ymd(new Date(now.getTime() - 29 * 86_400_000)), ymd(now))
  })
  const update = React.useCallback((patch: Partial<Pick<PeriodState, "key" | "customFrom" | "customTo">>) => {
    setState((s) => compute(patch.key ?? s.key, patch.customFrom ?? s.customFrom, patch.customTo ?? s.customTo))
  }, [])
  const query = `from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}`
  return { period: state, update, query }
}

/** Hoje / 7 / 30 / 90 dias / personalizado. */
export function PeriodFilter({ period, onChange, className }: { period: PeriodState; onChange: ReturnType<typeof usePeriod>["update"]; className?: string }) {
  const today = ymd(getNow())
  return (
    <div className={cn("flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <FilterTabs ariaLabel="Período" layoutId="admin-period" value={period.key} onChange={(key) => onChange({ key })} options={PERIODS} className="min-w-0 max-w-full" />
      {period.key === "custom" && (
        <div className="flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-2 py-1 shadow-xs">
          <CalendarRange className="size-3.5 shrink-0 text-subtle" />
          <input
            type="date"
            aria-label="Data inicial"
            value={period.customFrom}
            max={period.customTo || today}
            onChange={(e) => e.target.value && onChange({ customFrom: e.target.value })}
            className="h-7 bg-transparent text-[12.5px] text-foreground outline-none"
          />
          <span className="text-[12px] text-subtle">até</span>
          <input
            type="date"
            aria-label="Data final"
            value={period.customTo}
            min={period.customFrom}
            max={today}
            onChange={(e) => e.target.value && onChange({ customTo: e.target.value })}
            className="h-7 bg-transparent text-[12.5px] text-foreground outline-none"
          />
        </div>
      )}
    </div>
  )
}
