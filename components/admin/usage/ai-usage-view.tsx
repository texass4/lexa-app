"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, Cpu, RefreshCw, Sparkles, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { SearchField } from "@/components/ui/search-field"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/ui/panel"
import { useAdminData } from "@/lib/admin/client"
import { formatCount } from "@/lib/admin/catalog"
import { OPERATION_LABEL, formatUsd, type AIUsageOrg, type AIUsageOverview } from "@/lib/admin/ai-usage"
import { matches } from "@/lib/format"
import { AdminHeader } from "../ui/admin-header"
import { StatCard } from "../ui/stat-card"
import { PeriodFilter, usePeriod } from "../ui/period-filter"

type Data = AIUsageOverview & { unavailable?: boolean }

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : formatCount(n))

/** Consumo da Íntegra IA por escritório: chamadas, tokens, custo estimado, operações, modelos e erros no período. */
export function AIUsageView() {
  const { period, update, query } = usePeriod("30d")
  const { data, error, loading, reload } = useAdminData<Data>(`/api/admin/ai-usage?${query}`)
  const [search, setSearch] = React.useState("")
  const [open, setOpen] = React.useState<string | null>(null)
  const rows = (data?.organizations ?? []).filter((o) => matches(search, o.name))
  const totals = data?.totals

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Operação"
        title="Consumo de IA"
        description="Chamadas da Íntegra IA por escritório: tokens, custo estimado (US$), operações, modelos e erros. Respostas do cache não contam no plano."
        actions={
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <PeriodFilter period={period} onChange={update} />
            <Button variant="ghost" size="icon-sm" aria-label="Atualizar" onClick={reload} disabled={loading}>
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {error && !data ? (
        <Panel>
          <ErrorState onRetry={reload} description={error} />
        </Panel>
      ) : !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[120px] rounded-[14px]" />
            ))}
          </div>
          <Skeleton className="h-[300px] rounded-[14px]" />
        </div>
      ) : data.unavailable || !totals ? (
        <Panel>
          <EmptyState
            icon={<Cpu />}
            title="Medição detalhada indisponível."
            description="Aplique supabase/migrations/0013_ia_consumo.sql para registrar tokens, custo e erros de cada chamada."
          />
        </Panel>
      ) : (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Custo estimado"
              value={formatUsd(totals.costUsd)}
              icon={<Sparkles />}
              hint={`${rows.length} escritório(s) com uso no período`}
            />
            <StatCard
              label="Chamadas ao modelo"
              value={formatCount(totals.calls)}
              icon={<Cpu />}
              hint={`${formatCount(totals.cachedCalls)} respondidas pelo cache`}
              hintTone={totals.cachedCalls ? "success" : undefined}
            />
            <StatCard
              label="Tokens"
              value={tokens(totals.inputTokens + totals.outputTokens)}
              hint={`${tokens(totals.inputTokens)} entrada (${tokens(totals.cachedTokens)} do cache) · ${tokens(totals.outputTokens)} saída`}
            />
            <StatCard
              label="Erros"
              value={formatCount(totals.errors)}
              icon={<TriangleAlert />}
              hint={totals.errors ? "Falhas do provedor ou tempo esgotado" : "Nenhum erro no período"}
              hintTone={totals.errors ? "danger" : "success"}
            />
          </div>

          {totals.unpriced > 0 && (
            <p className="text-[12.5px] text-warning">
              {formatCount(totals.unpriced)} chamada(s) de modelo sem preço cadastrado: o custo está subestimado. Ajuste AI_PRICES no servidor.
            </p>
          )}

          <SearchField value={search} onChange={setSearch} placeholder="Buscar escritório…" className="sm:w-[280px]" />

          {rows.length === 0 ? (
            <Panel>
              <EmptyState icon={<Cpu />} title="Nenhum uso de IA no período." />
            </Panel>
          ) : (
            <ul className="space-y-3">
              {rows.map((o) => (
                <OrgRow
                  key={o.organizationId}
                  org={o}
                  open={open === o.organizationId}
                  onToggle={() => setOpen((v) => (v === o.organizationId ? null : o.organizationId))}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function OrgRow({ org, open, onToggle }: { org: AIUsageOrg; open: boolean; onToggle: () => void }) {
  const facts: [string, string][] = [
    ["Chamadas", formatCount(org.calls)],
    ["Do cache", formatCount(org.cachedCalls)],
    ["Tokens (entrada/saída)", `${tokens(org.inputTokens)} / ${tokens(org.outputTokens)}`],
    ["Custo estimado", formatUsd(org.costUsd)],
    ["Erros", formatCount(org.errors)],
  ]
  return (
    <li className="rounded-card border border-border/90 bg-card shadow-card">
      <div className="flex flex-col gap-2 border-b border-border px-5 py-3.5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/escritorios/${org.organizationId}?aba=uso`}
            className="group inline-flex items-center gap-1.5 font-medium outline-none hover:underline"
          >
            {org.name}
            <ArrowUpRight className="size-3.5 text-subtle transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
          </Link>
          <p className="text-[12px] text-muted-foreground">
            {[org.plan && `Plano ${org.plan}`, org.models.length ? `Modelos: ${org.models.join(", ")}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={open}>
          {open ? "Ocultar operações" : "Ver operações"}
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 md:grid-cols-5">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
            <dd className={cn("text-[14px] font-semibold tabular", label === "Erros" && org.errors > 0 && "text-danger")}>{value}</dd>
          </div>
        ))}
      </dl>
      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead className="text-left text-[11.5px] text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Operação</th>
                <th className="px-3 py-2 font-medium">Modelo</th>
                <th className="px-3 py-2 text-right font-medium">Chamadas</th>
                <th className="px-3 py-2 text-right font-medium">Cache</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Erros</th>
                <th className="px-5 py-2 text-right font-medium">Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {org.breakdown.map((b) => (
                <tr key={`${b.operation}:${b.model}`}>
                  <td className="px-5 py-2">{OPERATION_LABEL[b.operation] ?? b.operation}</td>
                  <td className="px-3 py-2 text-muted-foreground">{b.model}</td>
                  <td className="px-3 py-2 text-right tabular">{formatCount(b.calls)}</td>
                  <td className="px-3 py-2 text-right tabular">{formatCount(b.cachedCalls)}</td>
                  <td className="px-3 py-2 text-right tabular">{tokens(b.inputTokens + b.outputTokens)}</td>
                  <td className={cn("px-3 py-2 text-right tabular", b.errors > 0 && "text-danger")}>{formatCount(b.errors)}</td>
                  <td className="px-5 py-2 text-right tabular">{formatUsd(b.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}
