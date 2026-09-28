"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, CircleCheck, Mail, MapPin, Pause, Phone, Power, TriangleAlert, UsersRound } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { UnderlineTabs } from "@/components/ui/underline-tabs"
import { ErrorState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/ui/user-avatar"
import { FadeIn } from "@/components/ui/motion"
import { MembersManager } from "@/components/configuracoes/members-manager"
import { useAdminData } from "@/lib/admin/client"
import {
  formatBytes,
  formatCents,
  formatCount,
  LIMIT_KEYS,
  LIMIT_META,
  usageValue,
  type AdminOrganization,
  type AdminPlan,
  type AuditEntry,
  type SeriesPoint,
} from "@/lib/admin/catalog"
import type { MemberAccess } from "@/lib/auth/profile"
import { ROLE_LABELS } from "@/lib/auth/permissions"
import { fmtLongDate, fmtNumericDate, fmtRelative } from "@/lib/dates"
import { OrgStatusBadge, SubscriptionBadge } from "../ui/badges"
import { UsageMeter } from "../ui/usage-meter"
import { TrendChart } from "../ui/charts"
import { AuditList } from "../ui/audit-list"
import { ConfirmAction } from "../ui/confirm-action"
import { useOrgActions } from "./org-actions"
import { OrganizationConfig } from "./organization-config"

type Tab = "geral" | "uso" | "usuarios" | "atividade" | "config"

interface Detail {
  organization: AdminOrganization
  plan: AdminPlan | null
  plans: AdminPlan[]
  members: MemberAccess[]
  audit: AuditEntry[]
  activity: { id: string; at: string; type: string; actorName?: string }[]
  series: SeriesPoint[]
}

const ACTIVITY_LABEL: Record<string, string> = {
  document: "Documento",
  contract: "Contrato",
  petition: "Petição",
  appointment: "Compromisso",
  payment: "Pagamento",
  task: "Tarefa",
  client: "Cliente",
  hearing: "Audiência",
  summons: "Intimação",
  movement: "Movimentação",
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] break-words">{children || <span className="text-subtle">—</span>}</dd>
    </div>
  )
}

function Overview({ d, goTab }: { d: Detail; goTab: (t: Tab) => void }) {
  const o = d.organization
  const sub = o.subscription
  const created = d.series.reduce((acc, p) => acc + p.clients + p.processes + p.tasks + p.documents + p.appointments, 0)
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {o.alerts.length > 0 && (
          <button
            type="button"
            onClick={() => goTab("uso")}
            className="flex w-full items-center gap-3 rounded-[14px] border border-warning/25 bg-warning-soft px-4 py-3 text-left text-[13px] text-warning outline-none hover:border-warning/40 focus-visible:ring-2 focus-visible:ring-gold/45"
          >
            <TriangleAlert className="size-4 shrink-0" />
            <span className="flex-1">
              <strong className="font-semibold">Próximo do limite:</strong>{" "}
              {o.alerts.map((a) => `${LIMIT_META[a.key].label} ${Math.round(a.ratio * 100)}%`).join(" · ")}
            </span>
            <span className="font-medium">Ver uso →</span>
          </button>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Usuários", `${o.activeCount}/${o.memberCount}`, "ativos/total"],
            ["Clientes", formatCount(o.usage.clients), ""],
            ["Processos", formatCount(o.usage.processes), ""],
            ["Armazenamento", formatBytes(o.usage.storageBytes), ""],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-[12px] border border-border bg-card px-4 py-3 shadow-card">
              <p className="text-[11.5px] text-muted-foreground">{label}</p>
              <p className="tabular mt-1 text-[20px] font-semibold tracking-[-0.02em]">{value}</p>
              {hint && <p className="text-[11px] text-subtle">{hint}</p>}
            </div>
          ))}
        </div>
        <Panel>
          <PanelHeader title="Atividade no CRM" description={`${formatCount(created)} registros criados nos últimos 30 dias`} />
          <div className="px-3 pb-4">
            <TrendChart
              id="org-activity"
              tone="ink"
              height={180}
              unit="registros"
              label="Registros criados por dia nos últimos 30 dias"
              data={d.series.map((p) => ({
                label: `${p.day.slice(8, 10)}/${p.day.slice(5, 7)}`,
                full: fmtNumericDate(p.day),
                value: p.clients + p.processes + p.tasks + p.documents + p.appointments,
              }))}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Informações" />
          <dl className="divide-y divide-border px-5 pb-3">
            <InfoRow label="Razão social">{o.legalName}</InfoRow>
            <InfoRow label="CNPJ/CPF">{o.cnpj}</InfoRow>
            <InfoRow label="E-mail">{o.email}</InfoRow>
            <InfoRow label="Telefone">{o.phone}</InfoRow>
            <InfoRow label="Cidade">{o.city}</InfoRow>
            <InfoRow label="Endereço">{o.address}</InfoRow>
          </dl>
        </Panel>
      </div>
      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Responsável" />
          <div className="space-y-3 px-5 pb-5">
            {o.owners.length ? (
              o.owners.map((w) => (
                <div key={w.id} className="flex items-center gap-3">
                  <UserAvatar name={w.name} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{w.name}</p>
                    <a href={`mailto:${w.email}`} className="flex items-center gap-1 truncate text-[12px] text-muted-foreground hover:text-foreground">
                      <Mail className="size-3" /> {w.email}
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[12.5px] text-muted-foreground">Nenhum Sócio/Proprietário ativo.</p>
            )}
            {(o.phone || o.city) && (
              <div className="space-y-1 border-t border-border pt-3 text-[12px] text-muted-foreground">
                {o.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="size-3" /> {o.phone}
                  </p>
                )}
                {o.city && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-3" /> {o.city}
                  </p>
                )}
              </div>
            )}
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <div className="bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklab,var(--gold)_14%,transparent),transparent_60%)] px-5 pt-4.5 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-dark">Plano atual</p>
            <p className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">{o.plan}</p>
            <p className="text-[12.5px] text-muted-foreground">
              {d.plan?.priceCents ? `${formatCents(d.plan.priceCents)} / ${d.plan.interval === "year" ? "ano" : "mês"}` : "Preço não definido"}
            </p>
          </div>
          <dl className="divide-y divide-border px-5 pb-3">
            <InfoRow label="Assinatura">{sub ? <SubscriptionBadge status={sub.status} size="sm" /> : "—"}</InfoRow>
            {sub?.trialEndsAt && sub.status === "trialing" && <InfoRow label="Teste até">{fmtLongDate(sub.trialEndsAt)}</InfoRow>}
            {sub?.canceledAt && <InfoRow label="Cancelada em">{fmtNumericDate(sub.canceledAt)}</InfoRow>}
            <InfoRow label="Cobrança">{sub?.gateway === "manual" || !sub ? "Manual (sem gateway)" : sub.gateway}</InfoRow>
          </dl>
          <div className="border-t border-border px-5 py-3">
            <Button size="sm" variant="secondary" className="w-full" onClick={() => goTab("config")}>
              Alterar plano ou limites
            </Button>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Linha do tempo" />
          <dl className="divide-y divide-border px-5 pb-3">
            <InfoRow label="Criado em">{fmtLongDate(o.createdAt)}</InfoRow>
            <InfoRow label="Aprovado em">{o.approvedAt ? fmtLongDate(o.approvedAt) : null}</InfoRow>
            <InfoRow label="Último acesso">{o.usage.lastSignInAt ? fmtRelative(o.usage.lastSignInAt) : "Nunca"}</InfoRow>
            <InfoRow label="Última alteração de dados">{o.usage.lastDataAt ? fmtRelative(o.usage.lastDataAt) : "Nunca"}</InfoRow>
          </dl>
        </Panel>
      </div>
    </div>
  )
}

function Usage({ d, goTab }: { d: Detail; goTab: (t: Tab) => void }) {
  const o = d.organization
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="Consumo x limite"
          description={o.customLimits ? `Limites personalizados sobre o plano ${o.plan}.` : `Limites do plano ${o.plan}. WhatsApp e IA contam o mês corrente.`}
          action={
            <Button size="sm" variant="secondary" onClick={() => goTab("config")}>
              Ajustar limites
            </Button>
          }
        />
        <div className="grid gap-x-8 gap-y-5 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          {LIMIT_KEYS.map((k) => (
            <UsageMeter key={k} limitKey={k} used={usageValue(o.usage, k)} limit={o.limits[k]} />
          ))}
        </div>
      </Panel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Tarefas", o.usage.tasks],
          ["Documentos", o.usage.documents],
          ["Compromissos", o.usage.appointments],
          ["Faturas", o.usage.invoices],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[12px] border border-border bg-card px-4 py-3 shadow-card">
            <p className="text-[11.5px] text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-[20px] font-semibold tracking-[-0.02em]">{formatCount(Number(value))}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        O Admin vê só quantidades e tamanhos. O conteúdo de clientes, processos e documentos continua isolado no escritório.
      </p>
    </div>
  )
}

function ActivityTab({ d }: { d: Detail }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Auditoria" description="Acessos e alterações administrativas deste escritório" />
        <AuditList entries={d.audit} showOrganization={false} empty="Nenhum evento registrado ainda." />
      </Panel>
      <Panel>
        <PanelHeader title="Últimas ações no CRM" description="Tipo, autor e horário — sem o conteúdo" />
        {d.activity.length ? (
          <ul className="divide-y divide-border">
            {d.activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="rounded-md border border-border bg-surface-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {ACTIVITY_LABEL[a.type] ?? "Registro"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{a.actorName ?? "Equipe do escritório"}</span>
                <time className="shrink-0 text-[11.5px] text-subtle" dateTime={a.at}>
                  {fmtRelative(a.at)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-[12.5px] text-muted-foreground">Nenhuma ação registrada no CRM.</p>
        )}
      </Panel>
    </div>
  )
}

export function OrganizationDetailView({ id }: { id: string }) {
  const params = useSearchParams()
  const router = useRouter()
  const initial = (params.get("aba") as Tab | null) ?? "geral"
  const [tab, setTab] = React.useState<Tab>(["geral", "uso", "usuarios", "atividade", "config"].includes(initial) ? initial : "geral")
  const { data, error, reload } = useAdminData<Detail>(`/api/admin/organizations/${id}`)
  const actions = useOrgActions(reload)

  const goTab = (t: Tab) => {
    setTab(t)
    router.replace(`/admin/escritorios/${id}${t === "geral" ? "" : `?aba=${t}`}`, { scroll: false })
  }

  if (error && !data) {
    return (
      <Panel>
        <ErrorState title="Não foi possível abrir este escritório." description={error} onRetry={reload} />
        <div className="flex justify-center pb-8">
          <Link href="/admin/escritorios" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
            ← Voltar para Escritórios
          </Link>
        </div>
      </Panel>
    )
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-[360px] rounded-[14px] lg:col-span-2" />
          <Skeleton className="h-[360px] rounded-[14px]" />
        </div>
      </div>
    )
  }

  const o = data.organization
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/escritorios" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
          <ArrowLeft className="size-3.5" /> Escritórios
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]">{o.name}</h1>
              <OrgStatusBadge status={o.status} />
              {o.subscription && o.status !== "inactive" && <SubscriptionBadge status={o.subscription.status} />}
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Plano {o.plan} · {o.memberCount} {o.memberCount === 1 ? "usuário" : "usuários"} · desde {fmtNumericDate(o.createdAt)}
              {o.lastActivityAt && ` · ativo ${fmtRelative(o.lastActivityAt)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => goTab("usuarios")}>
              <UsersRound /> Usuários
            </Button>
            {o.status !== "active" && (
              <Button onClick={() => actions.setStatus(o, "active")}>
                <CircleCheck /> {o.status === "pending" ? "Aprovar" : "Ativar"}
              </Button>
            )}
            {o.status === "active" && (
              <Button variant="secondary" onClick={() => actions.setStatus(o, "suspended")}>
                <Pause /> Suspender
              </Button>
            )}
            {o.status !== "inactive" && (
              <Button variant="destructive" onClick={() => actions.setStatus(o, "inactive")}>
                <Power /> {o.status === "pending" ? "Recusar" : "Desativar"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <UnderlineTabs
        ariaLabel="Seções do escritório"
        layoutId="org-detail-tab"
        value={tab}
        onChange={goTab}
        tabs={[
          { value: "geral", label: "Visão geral" },
          { value: "uso", label: "Uso", count: o.alerts.length || undefined },
          { value: "usuarios", label: "Usuários", count: o.memberCount },
          { value: "atividade", label: "Atividade" },
          { value: "config", label: "Configurações" },
        ]}
      />

      <FadeIn key={tab} className={cn(tab === "usuarios" && "-mx-1")}>
        {tab === "geral" && <Overview d={data} goTab={goTab} />}
        {tab === "uso" && <Usage d={data} goTab={goTab} />}
        {tab === "usuarios" && (
          <div className="space-y-3">
            <MembersManager apiBase={`/api/admin/organizations/${o.id}/users`} title="Equipe" onChanged={reload} />
            <p className="px-1 text-[12px] text-muted-foreground">
              Papéis: {Object.entries(ROLE_LABELS)
                .filter(([k]) => k !== "super_admin")
                .map(([, v]) => v)
                .join(", ")}
              . Para mover alguém de escritório, use{" "}
              <Link href={`/admin/usuarios?org=${o.id}`} className="font-medium text-foreground hover:underline">
                Usuários
              </Link>
              .
            </p>
          </div>
        )}
        {tab === "atividade" && <ActivityTab d={data} />}
        {tab === "config" && <OrganizationConfig org={o} plan={data.plan} plans={data.plans} actions={actions} />}
      </FadeIn>

      <ConfirmAction request={actions.confirm} onClose={actions.closeConfirm} />
    </div>
  )
}
