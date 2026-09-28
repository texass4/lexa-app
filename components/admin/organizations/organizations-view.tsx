"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Activity,
  Building2,
  CircleCheck,
  Download,
  Ellipsis,
  Eye,
  Gauge,
  Layers,
  Pause,
  Pencil,
  Plus,
  Power,
  TriangleAlert,
  UsersRound,
} from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { NativeSelect } from "@/components/ui/field"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Modal } from "@/components/ui/modal"
import { SideSheet } from "@/components/ui/side-sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MembersManager } from "@/components/configuracoes/members-manager"
import { useAdminData } from "@/lib/admin/client"
import { formatCount, LIMIT_META, type AdminOrganization, type AdminPlan, type OrgStatus } from "@/lib/admin/catalog"
import { fmtNumericDate, fmtRelative, getNow } from "@/lib/dates"
import { matches } from "@/lib/format"
import { AdminHeader, rowMenuTrigger } from "../ui/admin-header"
import { OrgStatusBadge, SubscriptionBadge } from "../ui/badges"
import { ConfirmAction } from "../ui/confirm-action"
import { NewOfficeForm } from "./new-office-form"
import { useOrgActions } from "./org-actions"

type StatusFilter = "all" | OrgStatus | "trialing"
type Sort = "recent" | "name" | "activity" | "usage"
type Created = "any" | "7" | "30" | "90"

const DAY = 86_400_000

function OrgMenu({
  org,
  plans,
  onStatus,
  onPlan,
  onManage,
}: {
  org: AdminOrganization
  plans: AdminPlan[]
  onStatus: (s: OrgStatus) => void
  onPlan: (p: string) => void
  onManage: () => void
}) {
  const router = useRouter()
  const base = `/admin/escritorios/${org.id}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Ações para ${org.name}`} className={rowMenuTrigger} onClick={(e) => e.stopPropagation()}>
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-[10px] p-1">
        <DropdownMenuGroup>
          <DropdownMenuItem className="h-8 px-2" onClick={() => router.push(base)}>
            <Eye /> Visualizar escritório
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => router.push(`${base}?aba=config`)}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={onManage}>
            <UsersRound /> Gerenciar usuários
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => router.push(`${base}?aba=uso`)}>
            <Gauge /> Visualizar uso
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => router.push(`${base}?aba=atividade`)}>
            <Activity /> Visualizar atividade
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="h-8 px-2">
            <Layers /> Alterar plano
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48 rounded-[10px] p-1">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1 text-[11px]">Plano atual: {org.plan}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={org.plan} onValueChange={(p) => onPlan(String(p))}>
                {plans
                  .filter((p) => p.status === "active" || p.name === org.plan)
                  .map((p) => (
                    <DropdownMenuRadioItem key={p.id} value={p.name} className="h-8 px-2">
                      {p.name}
                    </DropdownMenuRadioItem>
                  ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {org.status !== "active" && (
            <DropdownMenuItem className="h-8 px-2" onClick={() => onStatus("active")}>
              <CircleCheck /> {org.status === "pending" ? "Aprovar" : "Ativar"}
            </DropdownMenuItem>
          )}
          {org.status === "active" && (
            <DropdownMenuItem className="h-8 px-2" onClick={() => onStatus("suspended")}>
              <Pause /> Suspender
            </DropdownMenuItem>
          )}
          {org.status !== "inactive" && (
            <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => onStatus("inactive")}>
              <Power /> {org.status === "pending" ? "Recusar cadastro" : "Desativar"}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AlertDot({ org }: { org: AdminOrganization }) {
  const top = org.alerts[0]
  if (!top) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn("inline-flex size-5 items-center justify-center rounded-[6px]", top.level === "warning" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}
            aria-label={`${LIMIT_META[top.key].label} em ${Math.round(top.ratio * 100)}% do limite`}
          />
        }
      >
        <TriangleAlert className="size-3" />
      </TooltipTrigger>
      <TooltipContent>
        {org.alerts.map((a) => `${LIMIT_META[a.key].label}: ${Math.round(a.ratio * 100)}%`).join(" · ")}
      </TooltipContent>
    </Tooltip>
  )
}

function exportCsv(rows: AdminOrganization[]) {
  const head = ["Escritório", "CNPJ/CPF", "Responsável", "E-mail", "Plano", "Status", "Assinatura", "Usuários", "Clientes", "Processos", "Criado em", "Última atividade"]
  const esc = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const lines = rows.map((o) =>
    [
      o.name,
      o.cnpj,
      o.owners[0]?.name,
      o.owners[0]?.email ?? o.email,
      o.plan,
      o.status,
      o.subscription?.status,
      o.memberCount,
      o.usage.clients,
      o.usage.processes,
      o.createdAt.slice(0, 10),
      o.lastActivityAt?.slice(0, 10),
    ]
      .map(esc)
      .join(";"),
  )
  const blob = new Blob([`﻿${[head.map(esc).join(";"), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `lexa-escritorios-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function OrganizationsView() {
  const params = useSearchParams()
  const router = useRouter()
  const { data, error, loading, reload } = useAdminData<{ organizations: AdminOrganization[]; plans: AdminPlan[] }>("/api/admin/organizations")
  const initialStatus = params.get("assinatura") === "trialing" ? "trialing" : ((params.get("status") as StatusFilter | null) ?? "all")
  const [status, setStatus] = React.useState<StatusFilter>(initialStatus)
  const [query, setQuery] = React.useState(params.get("q") ?? "")
  const [plan, setPlan] = React.useState(params.get("plano") ?? "all")
  const [created, setCreated] = React.useState<Created>("any")
  const [sort, setSort] = React.useState<Sort>("recent")
  const [creating, setCreating] = React.useState(params.get("novo") === "1")
  const [managing, setManaging] = React.useState<AdminOrganization | null>(null)
  const [shownManaging, setShownManaging] = React.useState<AdminOrganization | null>(null)
  if (managing && managing !== shownManaging) setShownManaging(managing)
  const actions = useOrgActions(reload)

  const orgs = React.useMemo(() => data?.organizations ?? [], [data])
  const plans = data?.plans ?? []
  const counts = React.useMemo(() => {
    const c: Record<StatusFilter, number> = { all: orgs.length, pending: 0, active: 0, suspended: 0, inactive: 0, trialing: 0 }
    for (const o of orgs) {
      c[o.status]++
      if (o.subscription?.status === "trialing" && o.status !== "inactive") c.trialing++
    }
    return c
  }, [orgs])

  const rows = React.useMemo(() => {
    const since = created === "any" ? 0 : getNow().getTime() - Number(created) * DAY
    const list = orgs.filter(
      (o) =>
        (status === "all" ? true : status === "trialing" ? o.subscription?.status === "trialing" && o.status !== "inactive" : o.status === status) &&
        (plan === "all" || o.plan === plan) &&
        (!since || new Date(o.createdAt).getTime() >= since) &&
        matches(query, o.name, o.cnpj, o.email, o.legalName, ...o.owners.flatMap((w) => [w.name, w.email])),
    )
    const time = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
    const pressure = (o: AdminOrganization) => o.alerts[0]?.ratio ?? 0
    return [...list].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "pt-BR")
        : sort === "activity"
          ? time(b.lastActivityAt) - time(a.lastActivityAt)
          : sort === "usage"
            ? pressure(b) - pressure(a)
            : time(b.createdAt) - time(a.createdAt),
    )
  }, [orgs, status, plan, created, query, sort])

  const filtered = query || plan !== "all" || created !== "any"
  const clearFilters = () => {
    setQuery("")
    setPlan("all")
    setCreated("any")
    setStatus("all")
  }
  const sheetOrg = managing ?? shownManaging

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Operação"
        title="Escritórios"
        description="Aprove cadastros, acompanhe o uso e gerencie status, plano e equipe de cada escritório."
        actions={
          <>
            <Button variant="secondary" onClick={() => exportCsv(rows)} disabled={!rows.length}>
              <Download /> Exportar
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!data}>
              <Plus /> Novo escritório
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <FilterTabs
          ariaLabel="Filtrar por status"
          layoutId="org-status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Todos", count: counts.all },
            { value: "pending", label: "Pendentes", count: counts.pending },
            { value: "active", label: "Ativos", count: counts.active },
            { value: "trialing", label: "Em teste", count: counts.trialing },
            { value: "suspended", label: "Suspensos", count: counts.suspended },
            { value: "inactive", label: "Inativos", count: counts.inactive },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <SearchField value={query} onChange={setQuery} placeholder="Nome, CNPJ, e-mail ou responsável…" className="col-span-2 sm:w-[320px]" />
          <NativeSelect aria-label="Plano" value={plan} onChange={(e) => setPlan(e.target.value)} className="sm:w-[160px]">
            <option value="all">Todos os planos</option>
            {plans.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Data de criação" value={created} onChange={(e) => setCreated(e.target.value as Created)} className="sm:w-[170px]">
            <option value="any">Qualquer data</option>
            <option value="7">Criados em 7 dias</option>
            <option value="30">Criados em 30 dias</option>
            <option value="90">Criados em 90 dias</option>
          </NativeSelect>
          <NativeSelect aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="col-span-2 sm:ml-auto sm:w-[190px]">
            <option value="recent">Mais recentes</option>
            <option value="name">Nome (A–Z)</option>
            <option value="activity">Última atividade</option>
            <option value="usage">Mais perto do limite</option>
          </NativeSelect>
        </div>
      </div>

      {error && !data ? (
        <TableShell>
          <ErrorState onRetry={reload} description={error} />
        </TableShell>
      ) : !data ? (
        <SkeletonTable rows={8} />
      ) : rows.length === 0 ? (
        <TableShell>
          <EmptyState
            icon={<Building2 />}
            title={orgs.length === 0 ? "Nenhum escritório ainda." : status === "pending" ? "Nenhum cadastro aguardando aprovação." : "Nenhum escritório encontrado."}
            description={filtered ? "Ajuste a busca ou os filtros." : orgs.length === 0 ? "Crie o primeiro escritório ou divulgue a página de cadastro." : undefined}
            action={
              filtered || status !== "all" ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus /> Novo escritório
                </Button>
              )
            }
          />
        </TableShell>
      ) : (
        <div className={cn("transition-opacity", loading && "opacity-60")}>
          {/* Tabela: tablet e desktop */}
          <TableShell className="max-md:hidden">
            <div className="overflow-x-auto thin-scrollbar">
              <table className="w-full min-w-[1080px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <Th>Escritório</Th>
                    <Th>Responsável</Th>
                    <Th>Plano</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Usuários</Th>
                    <Th className="text-right">Clientes</Th>
                    <Th className="text-right">Processos</Th>
                    <Th>Criado em</Th>
                    <Th>Última atividade</Th>
                    <Th className="w-10" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child_td]:border-0">
                  {rows.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => router.push(`/admin/escritorios/${o.id}`)}
                      className="group cursor-pointer transition-colors hover:bg-surface-muted/50"
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/escritorios/${o.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-medium outline-none group-hover:underline focus-visible:underline"
                          >
                            {o.name}
                          </Link>
                          <AlertDot org={o} />
                        </div>
                        <p className="text-[12px] text-muted-foreground">{o.cnpj || "Sem CNPJ/CPF"}</p>
                      </Td>
                      <Td>
                        {o.owners[0] ? (
                          <>
                            <p className="max-w-[200px] truncate">{o.owners[0].name}</p>
                            <p className="max-w-[200px] truncate text-[12px] text-muted-foreground">{o.owners[0].email}</p>
                          </>
                        ) : (
                          <span className="text-subtle">{o.email || "—"}</span>
                        )}
                      </Td>
                      <Td>
                        <p className="font-medium">{o.plan}</p>
                        {o.subscription && o.status !== "inactive" && (
                          <div className="mt-1">
                            <SubscriptionBadge status={o.subscription.status} size="sm" />
                          </div>
                        )}
                      </Td>
                      <Td>
                        <OrgStatusBadge status={o.status} />
                      </Td>
                      <Td className="tabular text-right">
                        {o.activeCount}
                        <span className="text-subtle">/{o.memberCount}</span>
                      </Td>
                      <Td className="tabular text-right">{formatCount(o.usage.clients)}</Td>
                      <Td className="tabular text-right">{formatCount(o.usage.processes)}</Td>
                      <Td className="tabular whitespace-nowrap text-muted-foreground">{fmtNumericDate(o.createdAt)}</Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{o.lastActivityAt ? fmtRelative(o.lastActivityAt) : "Nunca"}</Td>
                      <Td onClick={(e) => e.stopPropagation()}>
                        <OrgMenu
                          org={o}
                          plans={plans}
                          onStatus={(s) => actions.setStatus(o, s)}
                          onPlan={(p) => actions.setPlan(o, p)}
                          onManage={() => setManaging(o)}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-surface-muted/30 px-5 py-2.5 text-[12px] text-muted-foreground">
              {rows.length} de {orgs.length} escritórios
            </div>
          </TableShell>

          {/* Cartões: celular */}
          <ul className="space-y-2.5 md:hidden">
            {rows.map((o) => (
              <li key={o.id} className="rounded-[14px] border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/admin/escritorios/${o.id}`} className="min-w-0 flex-1 outline-none">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {o.name} <AlertDot org={o} />
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">{o.owners[0]?.email ?? o.email ?? "—"}</p>
                  </Link>
                  <OrgMenu
                    org={o}
                    plans={plans}
                    onStatus={(s) => actions.setStatus(o, s)}
                    onPlan={(p) => actions.setPlan(o, p)}
                    onManage={() => setManaging(o)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <OrgStatusBadge status={o.status} size="sm" />
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{o.plan}</span>
                  {o.subscription && o.status !== "inactive" && <SubscriptionBadge status={o.subscription.status} size="sm" />}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  {[
                    ["Usuários", o.memberCount],
                    ["Clientes", o.usage.clients],
                    ["Processos", o.usage.processes],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] text-muted-foreground">{label}</dt>
                      <dd className="tabular text-[14px] font-semibold">{formatCount(Number(value))}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="Novo escritório"
        description="O escritório já nasce ativo e o sócio recebe um convite para criar a senha."
        icon={<Building2 />}
        bare
      >
        <NewOfficeForm
          plans={plans}
          onDone={(done) => {
            setCreating(false)
            if (done) reload()
          }}
        />
      </Modal>

      <SideSheet
        open={!!managing}
        onOpenChange={(o) => {
          if (!o) {
            setManaging(null)
            reload()
          }
        }}
        title={`Usuários de ${sheetOrg?.name ?? ""}`}
        className="sm:w-[min(960px,calc(100vw-1rem))]"
        header={
          <div className="border-b border-border px-5 pt-5 pb-4 pr-14">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold-dark">Usuários</p>
            <h2 className="mt-1 text-[18px] font-semibold">{sheetOrg?.name}</h2>
          </div>
        }
      >
        <div className="p-4">
          {sheetOrg && <MembersManager key={sheetOrg.id} apiBase={`/api/admin/organizations/${sheetOrg.id}/users`} title="Equipe" />}
        </div>
      </SideSheet>

      <ConfirmAction request={actions.confirm} onClose={actions.closeConfirm} />
    </div>
  )
}
