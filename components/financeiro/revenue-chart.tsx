"use client"

import { useMounted } from "@/lib/hooks"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatCurrency, formatCurrencyCompact } from "@/lib/format"
import type { MonthRevenue } from "@/lib/selectors"
import { Skeleton } from "@/components/ui/skeleton"

type TooltipPayload = { dataKey?: string | number; value?: number; color?: string; payload?: MonthRevenue }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[168px] rounded-[10px] border border-border bg-popover px-3 py-2.5 shadow-float">
      <p className="text-[12px] font-medium text-foreground">{payload[0]?.payload?.label ?? label}</p>
      <div className="mt-1.5 space-y-1">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-[12px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.dataKey === "recebida" ? "Recebida" : "Prevista"}
            </span>
            <span className="tabular font-medium text-foreground">{formatCurrency(Number(p.value))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 11.5 },
} as const

export function RevenueAreaChart({ data, height = 180 }: { data: MonthRevenue[]; height?: number }) {
  const mounted = useMounted()
  if (!mounted) return <Skeleton style={{ height }} className="w-full rounded-[10px]" />
  return (
    <div
      style={{ height }}
      className="w-full"
      role="img"
      aria-label={`Gráfico de receita recebida e prevista de ${data[0]?.label} a ${data[data.length - 1]?.label}`}
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRecebida" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis dataKey="month" {...axisProps} dy={6} />
          <YAxis hide domain={[0, (max: number) => Math.max(max * 1.15, 1)]} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="prevista" stroke="var(--border-strong)" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} />
          <Area
            type="monotone"
            dataKey="recebida"
            stroke="var(--gold)"
            strokeWidth={2}
            fill="url(#gradRecebida)"
            dot={false}
            activeDot={{ r: 4, fill: "var(--gold)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RevenueBarChart({ data, height = 280 }: { data: MonthRevenue[]; height?: number }) {
  const mounted = useMounted()
  if (!mounted) return <Skeleton style={{ height }} className="w-full rounded-[10px]" />
  return (
    <div
      style={{ height }}
      className="w-full"
      role="img"
      aria-label={`Receita mensal prevista e recebida de ${data[0]?.label} a ${data[data.length - 1]?.label}`}
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 720, height }}>
        <BarChart data={data} barGap={4} barCategoryGap="28%" margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis dataKey="month" {...axisProps} dy={6} />
          <YAxis {...axisProps} width={64} tickFormatter={(v: number) => formatCurrencyCompact(v).replace(",0", "")} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-muted)", opacity: 0.7 }} />
          <Bar dataKey="prevista" fill="var(--border-strong)" radius={[5, 5, 1, 1]} maxBarSize={28} />
          <Bar dataKey="recebida" fill="var(--foreground)" radius={[5, 5, 1, 1]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
