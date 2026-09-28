"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useMounted } from "@/lib/hooks"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Gráficos discretos do Admin. Uma série por gráfico (sem eixo duplo, sem paleta
 * categórica): o título diz o que é, o tooltip dá o valor exato e o traço/preenchimento
 * usa os tokens da marca (tinta e dourado), que já funcionam no claro e no escuro.
 */

export interface ChartPoint {
  label: string
  /** Rótulo longo para o tooltip (ex.: "Seg, 21 set"). */
  full: string
  value: number
}

const axis = { tickLine: false, axisLine: false, tick: { fill: "var(--muted-foreground)", fontSize: 11 } } as const

function Tip({ active, payload, unit, format }: { active?: boolean; payload?: { payload?: ChartPoint; value?: number }[]; unit: string; format?: (v: number) => string }) {
  const p = payload?.[0]
  if (!active || !p?.payload) return null
  return (
    <div className="rounded-[10px] border border-border bg-popover px-3 py-2 shadow-float">
      <p className="text-[11.5px] text-muted-foreground">{p.payload.full}</p>
      <p className="tabular mt-0.5 text-[13px] font-semibold text-foreground">
        {format ? format(Number(p.value)) : Number(p.value).toLocaleString("pt-BR")} <span className="font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  )
}

function Frame({ height, label, children }: { height: number; label: string; children: React.ReactNode }) {
  const mounted = useMounted()
  if (!mounted) return <Skeleton style={{ height }} className="w-full rounded-[10px]" />
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={label}>
      {children}
    </div>
  )
}

/** Linha com área — tendência (acumulado ou diário). */
export function TrendChart({
  data,
  height = 200,
  unit,
  label,
  tone = "gold",
  id,
  format,
}: {
  data: ChartPoint[]
  height?: number
  unit: string
  label: string
  tone?: "gold" | "ink"
  id: string
  format?: (v: number) => string
}) {
  const color = tone === "gold" ? "var(--gold)" : "var(--foreground)"
  return (
    <Frame height={height} label={label}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
        <AreaChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis dataKey="label" {...axis} dy={6} minTickGap={24} />
          <YAxis {...axis} width={36} allowDecimals={false} domain={[0, (max: number) => Math.max(Math.ceil(max * 1.15), 1)]} tickFormatter={format} />
          <Tooltip content={<Tip unit={unit} format={format} />} cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${id})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  )
}

/** Barras por dia — volumes. */
export function BarsChart({ data, height = 200, unit, label, format }: { data: ChartPoint[]; height?: number; unit: string; label: string; format?: (v: number) => string }) {
  return (
    <Frame height={height} label={label}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
        <BarChart data={data} barCategoryGap="22%" margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis dataKey="label" {...axis} dy={6} minTickGap={16} />
          <YAxis {...axis} width={36} allowDecimals={false} tickFormatter={format} />
          <Tooltip content={<Tip unit={unit} format={format} />} cursor={{ fill: "var(--surface-muted)", opacity: 0.7 }} />
          <Bar dataKey="value" fill="var(--foreground)" radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  )
}

/** Barras horizontais em HTML (distribuições com poucas categorias): rótulo e valor sempre visíveis. */
export function BarList({
  items,
  format = (v) => v.toLocaleString("pt-BR"),
  empty = "Sem dados.",
}: {
  items: { label: string; value: number; detail?: string; href?: string }[]
  format?: (v: number) => string
  empty?: string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  if (!items.length) return <p className="py-6 text-center text-[12.5px] text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="truncate font-medium text-foreground">{item.label}</span>
            <span className="tabular shrink-0 text-muted-foreground">
              <span className="font-semibold text-foreground">{format(item.value)}</span>
              {item.detail && <span className="text-subtle"> · {item.detail}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
