"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowUpRight, Gauge, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { SearchField } from "@/components/ui/search-field"
import { NativeSelect } from "@/components/ui/field"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/ui/panel"
import { useAdminData } from "@/lib/admin/client"
import { formatBytes, formatCount, LIMIT_KEYS, LIMIT_META, usageValue, type AdminOrganization, type AdminPlan } from "@/lib/admin/catalog"
import { matches } from "@/lib/core/format"
import { AdminHeader } from "../ui/admin-header"
import { StatCard } from "../ui/stat-card"
import { UsageMeter } from "../ui/usage-meter"
import { OrgStatusBadge } from "../ui/badges"

type Sort = "pressure" | "name" | "storage" | "processes"

export function UsageView() {
  const params = useSearchParams()
  const { data, error, reload } = useAdminData<{ organizations: AdminOrganization[]; plans: AdminPlan[] }>("/api/admin/organizations")
  const [query, setQuery] = React.useState("")
  const [onlyAlerts, setOnlyAlerts] = React.useState(params.get("alerta") === "1")
  const [plan, setPlan] = React.useState("all")
  const [sort, setSort] = React.useState<Sort>("pressure")

  const orgs = React.useMemo(() => (data?.organizations ?? []).filter((o) => o.status !== "inactive"), [data])
  const alerted = orgs.filter((o) => o.alerts.length)
  const critical = orgs.filter((o) => o.alerts.some((a) => a.level !== "warning"))
  const storage = orgs.reduce((acc, o) => acc + o.usage.storageBytes, 0)
  const whatsapp = orgs.reduce((acc, o) => acc + o.usage.whatsappMonth, 0)
  const ai = orgs.reduce((acc, o) => acc + o.usage.aiMonth, 0)

  const rows = orgs
    .filter((o) => (!onlyAlerts || o.alerts.length) && (plan === "all" || o.plan === plan) && matches(query, o.name, o.cnpj))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "pt-BR")
        : sort === "storage"
          ? b.usage.storageBytes - a.usage.storageBytes
          : sort === "processes"
            ? b.usage.processes - a.usage.processes
            : (b.alerts[0]?.ratio ?? 0) - (a.alerts[0]?.ratio ?? 0) || b.usage.processes - a.usage.processes,
    )

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Operação"
        title="Uso da plataforma"
        description="Consumo de cada escritório contra o limite do plano. Alertas a partir do percentual definido em Configurações."
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
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[150px] rounded-[14px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Próximos do limite"
              value={alerted.length}
              icon={<TriangleAlert />}
              hint={critical.length ? `${critical.length} já no limite ou acima` : "Nenhum no limite"}
              hintTone={critical.length ? "danger" : undefined}
            />
            <StatCard label="Armazenamento total" value={formatBytes(storage)} icon={<Gauge />} hint={`${orgs.length} escritórios com acesso`} />
            <StatCard label="Mensagens WhatsApp" value={formatCount(whatsapp)} hint="Neste mês · integração em preparação" />
            <StatCard
              label="Chamadas de IA"
              value={formatCount(ai)}
              hint="Neste mês · contam no limite do plano"
              href="/admin/ia"
              action="Consumo de IA"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchField value={query} onChange={setQuery} placeholder="Buscar escritório…" className="sm:w-[280px]" />
            <NativeSelect aria-label="Plano" value={plan} onChange={(e) => setPlan(e.target.value)} className="sm:w-[170px]">
              <option value="all">Todos os planos</option>
              {data.plans.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sm:w-[190px]">
              <option value="pressure">Mais perto do limite</option>
              <option value="storage">Mais armazenamento</option>
              <option value="processes">Mais processos</option>
              <option value="name">Nome (A–Z)</option>
            </NativeSelect>
            <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground sm:ml-auto">
              <ToggleSwitch label="Somente em alerta" checked={onlyAlerts} onChange={setOnlyAlerts} />
              Somente em alerta ({alerted.length})
            </label>
          </div>

          {rows.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Gauge />}
                title={onlyAlerts ? "Nenhum escritório perto do limite." : "Nenhum escritório encontrado."}
                description={onlyAlerts ? "Todos estão abaixo do percentual de alerta." : undefined}
              />
            </Panel>
          ) : (
            <ul className="space-y-3">
              {rows.map((o) => {
                const worst = o.alerts[0]
                return (
                  <li
                    key={o.id}
                    className={cn(
                      "rounded-[14px] border bg-card shadow-card transition-colors",
                      worst ? (worst.level === "warning" ? "border-warning/30" : "border-danger/30") : "border-border",
                    )}
                  >
                    <div className="flex flex-col gap-2 border-b border-border px-5 py-3.5 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/escritorios/${o.id}?aba=uso`}
                          className="group inline-flex items-center gap-1.5 font-medium outline-none hover:underline"
                        >
                          {o.name}
                          <ArrowUpRight className="size-3.5 text-subtle transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
                        </Link>
                        <p className="text-[12px] text-muted-foreground">
                          Plano {o.plan}
                          {o.customLimits && " · limites personalizados"} · {formatCount(o.usage.tasks)} tarefas · {formatCount(o.usage.documents)}{" "}
                          documentos
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {worst && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[12px] font-medium",
                              worst.level === "warning" ? "text-warning" : "text-danger",
                            )}
                          >
                            <TriangleAlert className="size-3.5" /> {LIMIT_META[worst.key].label} {Math.round(worst.ratio * 100)}%
                          </span>
                        )}
                        {o.status !== "active" && <OrgStatusBadge status={o.status} size="sm" />}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 md:grid-cols-3 xl:grid-cols-6">
                      {LIMIT_KEYS.map((k) => (
                        <UsageMeter key={k} compact limitKey={k} used={usageValue(o.usage, k)} limit={o.limits[k]} />
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
