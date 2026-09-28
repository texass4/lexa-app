"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Building2, Check, CircleCheck, CreditCard, Layers, Pencil, Plus, Power } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/ui/panel"
import { FadeIn } from "@/components/ui/motion"
import { adminFetch, useAdminData } from "@/lib/admin/client"
import {
  formatCents,
  formatLimitValue,
  LIMIT_KEYS,
  LIMIT_META,
  monthlyCents,
  PLAN_FEATURES,
  type AdminPlan,
  type LimitKey,
  type PlanFeature,
  type PlanLimits,
} from "@/lib/admin/catalog"
import { AdminHeader } from "../ui/admin-header"
import { ConfirmAction, type ConfirmRequest } from "../ui/confirm-action"
import { useAdminShell } from "../shell/admin-context"

interface PlansData {
  plans: AdminPlan[]
  defaultLimits: PlanLimits
  defaultPlan: string
}

const GB = 1024

/** "149,90" → 14990 */
const parseMoney = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN
}
const moneyInput = (cents: number) => (cents ? (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "")

function PlanForm({ plan, defaults, onDone }: { plan: AdminPlan | null; defaults: PlanLimits; onDone: (ok: boolean) => void }) {
  const limits = plan?.limits ?? defaults
  const [form, setForm] = React.useState({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    price: moneyInput(plan?.priceCents ?? 0),
    interval: plan?.interval ?? "month",
    sortOrder: String(plan?.sortOrder ?? 10),
    gatewayProductId: plan?.gatewayProductId ?? "",
    gatewayPriceId: plan?.gatewayPriceId ?? "",
  })
  const [lim, setLim] = React.useState(() =>
    Object.fromEntries(LIMIT_KEYS.map((k) => [k, limits[k] === null ? "" : String(k === "storage" ? +(limits[k]! / GB).toFixed(2) : limits[k])])) as Record<LimitKey, string>,
  )
  const [features, setFeatures] = React.useState<Set<PlanFeature>>(new Set<PlanFeature>(plan?.features ?? ["clients", "processes", "tasks", "agenda", "documents"]))
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const priceCents = form.price.trim() ? parseMoney(form.price) : 0
    if (form.name.trim().length < 2) return setError("Informe o nome do plano.")
    if (Number.isNaN(priceCents)) return setError("Preço inválido. Use o formato 149,90.")
    const limitsBody = Object.fromEntries(
      LIMIT_KEYS.map((k) => {
        const raw = lim[k].trim()
        if (!raw) return [k, null]
        const n = Number(raw.replace(",", "."))
        return [k, Number.isFinite(n) ? Math.round(k === "storage" ? n * GB : n) : null]
      }),
    )
    const body = {
      name: form.name,
      description: form.description,
      priceCents,
      interval: form.interval,
      sortOrder: Number(form.sortOrder) || 0,
      limits: limitsBody,
      features: [...features],
      gatewayProductId: form.gatewayProductId,
      gatewayPriceId: form.gatewayPriceId,
    }
    setBusy(true)
    setError("")
    try {
      if (plan) await adminFetch(`/api/admin/plans/${plan.id}`, "PATCH", body)
      else await adminFetch("/api/admin/plans", "POST", body)
      toast.success(plan ? "Plano atualizado." : "Plano criado.", { description: form.name })
      onDone(true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <ModalBody>
        <form id="plan-form" onSubmit={submit} noValidate className="space-y-6">
          {error && (
            <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <Field label="Nome do plano" htmlFor="pf-name" className="sm:col-span-4">
              <TextInput id="pf-name" autoFocus={!plan} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Ordem" htmlFor="pf-order" className="sm:col-span-2" hint="Menor aparece primeiro.">
              <TextInput id="pf-order" inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Descrição" htmlFor="pf-desc" optional className="sm:col-span-6">
              <TextArea id="pf-desc" className="min-h-[60px]" maxLength={300} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Preço" htmlFor="pf-price" className="sm:col-span-3" hint={plan?.organizations ? `Vale para ${plan.organizations} escritório(s) no próximo ciclo.` : undefined}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-subtle">R$</span>
                <TextInput id="pf-price" inputMode="decimal" placeholder="0,00" className="tabular pl-9" value={form.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.,]/g, ""))} />
              </div>
            </Field>
            <Field label="Cobrança" htmlFor="pf-interval" className="sm:col-span-3">
              <NativeSelect id="pf-interval" value={form.interval} onChange={(e) => set("interval", e.target.value as "month" | "year")}>
                <option value="month">Mensal</option>
                <option value="year">Anual</option>
              </NativeSelect>
            </Field>
          </div>

          <fieldset>
            <legend className="text-[13px] font-semibold">Limites</legend>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Deixe em branco para ilimitado. WhatsApp e IA são por mês.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {LIMIT_KEYS.map((k) => (
                <Field key={k} label={LIMIT_META[k].label} htmlFor={`pf-${k}`}>
                  <div className="relative">
                    <TextInput
                      id={`pf-${k}`}
                      inputMode="decimal"
                      placeholder="Ilimitado"
                      className="tabular pr-12"
                      value={lim[k]}
                      onChange={(e) => setLim((l) => ({ ...l, [k]: e.target.value.replace(/[^\d.,]/g, "") }))}
                    />
                    {k === "storage" && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-subtle">GB</span>}
                  </div>
                </Field>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[13px] font-semibold">Recursos habilitados</legend>
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {PLAN_FEATURES.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 rounded-[8px] py-1.5 text-[13px]">
                  {f.label}
                  <ToggleSwitch
                    label={f.label}
                    checked={features.has(f.key)}
                    onChange={(on) =>
                      setFeatures((s) => {
                        const next = new Set(s)
                        if (on) next.add(f.key)
                        else next.delete(f.key)
                        return next
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <details className="group rounded-[10px] border border-border bg-surface-muted/40 px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-medium outline-none">Integração com gateway de pagamento</summary>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Preencha quando conectar Stripe, Mercado Pago ou outro gateway. Os IDs ligam este plano ao produto/preço de lá.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="ID do produto" htmlFor="pf-gprod" optional>
                <TextInput id="pf-gprod" placeholder="prod_…" value={form.gatewayProductId} onChange={(e) => set("gatewayProductId", e.target.value)} />
              </Field>
              <Field label="ID do preço" htmlFor="pf-gprice" optional>
                <TextInput id="pf-gprice" placeholder="price_…" value={form.gatewayPriceId} onChange={(e) => set("gatewayPriceId", e.target.value)} />
              </Field>
            </div>
          </details>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => onDone(false)}>
          Cancelar
        </Button>
        <Button type="submit" form="plan-form" disabled={busy}>
          {busy ? "Salvando…" : plan ? "Salvar plano" : "Criar plano"}
        </Button>
      </ModalFooter>
    </>
  )
}

function PlanCard({ plan, isDefault, onEdit, onToggle }: { plan: AdminPlan; isDefault: boolean; onEdit: () => void; onToggle: () => void }) {
  const inactive = plan.status !== "active"
  return (
    <article
      className={cn(
        "group flex flex-col rounded-[16px] border bg-card shadow-card transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-float",
        inactive ? "border-dashed border-border opacity-70" : "border-border",
      )}
    >
      <div className="bg-[radial-gradient(120%_100%_at_100%_0%,color-mix(in_oklab,var(--gold)_10%,transparent),transparent_55%)] p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em]">
              {plan.name}
              {isDefault && (
                <span className="rounded-[5px] bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-gold-dark">Padrão</span>
              )}
            </h3>
            {plan.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{plan.description}</p>}
          </div>
          <StatusBadge tone={inactive ? "neutral" : "success"} size="sm">
            {inactive ? "Desativado" : "Ativo"}
          </StatusBadge>
        </div>
        <div className="mt-4 flex items-baseline gap-1">
          {plan.priceCents ? (
            <>
              <span className="tabular text-[26px] font-semibold tracking-[-0.03em]">{formatCents(plan.priceCents)}</span>
              <span className="text-[12.5px] text-muted-foreground">/{plan.interval === "year" ? "ano" : "mês"}</span>
            </>
          ) : (
            <button type="button" onClick={onEdit} className="text-[13px] font-medium text-gold-dark underline-offset-4 hover:underline">
              Definir preço →
            </button>
          )}
        </div>
        {plan.interval === "year" && plan.priceCents > 0 && <p className="text-[11.5px] text-subtle">≈ {formatCents(monthlyCents(plan))}/mês</p>}
        <Link
          href={`/admin/escritorios?plano=${encodeURIComponent(plan.name)}`}
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <Building2 className="size-3.5" /> {plan.organizations} {plan.organizations === 1 ? "escritório" : "escritórios"}
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border px-5 py-4">
        {LIMIT_KEYS.map((k) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{LIMIT_META[k].label}</dt>
            <dd className="tabular truncate text-[13px] font-medium">
              {formatLimitValue(k, plan.limits[k])}
              {LIMIT_META[k].monthly && plan.limits[k] !== null && <span className="font-normal text-subtle">/mês</span>}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-wrap gap-1.5 border-t border-border px-5 py-4">
        {PLAN_FEATURES.filter((f) => plan.features.includes(f.key)).map((f) => (
          <li key={f.key} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <Check className="size-3 text-success" /> {f.label}
          </li>
        ))}
        {!plan.features.length && <li className="text-[12px] text-subtle">Nenhum recurso marcado.</li>}
      </ul>
      <div className="mt-auto flex gap-2 border-t border-border px-5 py-3">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onEdit}>
          <Pencil /> Editar
        </Button>
        <Button size="sm" variant={inactive ? "secondary" : "ghost"} onClick={onToggle}>
          {inactive ? <CircleCheck /> : <Power />} {inactive ? "Ativar" : "Desativar"}
        </Button>
      </div>
    </article>
  )
}

export function PlansView() {
  const { data, error, loading, reload } = useAdminData<PlansData>("/api/admin/plans")
  const { refresh } = useAdminShell()
  const [editing, setEditing] = React.useState<AdminPlan | "new" | null>(null)
  const [shown, setShown] = React.useState<AdminPlan | "new" | null>(null)
  if (editing && editing !== shown) setShown(editing)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)

  const toggle = (plan: AdminPlan) => {
    const next = plan.status === "active" ? "inactive" : "active"
    const apply = async () => {
      try {
        await adminFetch(`/api/admin/plans/${plan.id}`, "PATCH", { status: next })
        toast.success(next === "active" ? "Plano ativado." : "Plano desativado.", { description: plan.name })
        reload()
        refresh()
      } catch (err) {
        toast.error((err as Error).message)
        throw err
      }
    }
    if (next === "active") return void apply().catch(() => undefined)
    setConfirm({
      title: `Desativar o plano ${plan.name}?`,
      description: plan.organizations
        ? `Ele deixa de aparecer para novos escritórios. Os ${plan.organizations} escritório(s) que já estão nele continuam com os mesmos limites até você migrá-los.`
        : "Ele deixa de aparecer para novos escritórios. Dá para reativar a qualquer momento.",
      confirmLabel: "Desativar plano",
      onConfirm: apply,
    })
  }

  const current = editing ?? shown
  const plans = data?.plans ?? []
  const active = plans.filter((p) => p.status === "active")

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Negócio"
        title="Planos e assinaturas"
        description="O catálogo que define preço, limites e recursos de cada escritório. Alterações valem na hora para quem está no plano."
        actions={
          <Button onClick={() => setEditing("new")} disabled={!data}>
            <Plus /> Novo plano
          </Button>
        }
      />

      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-muted/60 text-muted-foreground">
          <CreditCard className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">Cobrança manual — nenhum gateway conectado</p>
          <p className="text-[12.5px] text-muted-foreground">
            Planos e assinaturas já estão modelados para Stripe ou Mercado Pago (IDs de produto/preço, status da assinatura, pagamentos). Até lá, nada é cobrado
            automaticamente.
          </p>
        </div>
        <Link href="/admin/financeiro" className="shrink-0 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          Ver assinaturas →
        </Link>
      </Panel>

      {error && !data ? (
        <Panel>
          <ErrorState onRetry={reload} description={error} />
        </Panel>
      ) : !data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[420px] rounded-[16px]" />
          ))}
        </div>
      ) : !plans.length ? (
        <Panel>
          <EmptyState icon={<Layers />} title="Nenhum plano cadastrado." description="Crie o primeiro plano para atribuir aos escritórios." />
        </Panel>
      ) : (
        <FadeIn className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} isDefault={p.name === data.defaultPlan} onEdit={() => setEditing(p)} onToggle={() => toggle(p)} />
          ))}
        </FadeIn>
      )}
      {data && active.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Plano padrão de novos cadastros: <strong className="font-medium text-foreground">{data.defaultPlan}</strong> — altere em{" "}
          <Link href="/admin/configuracoes" className="font-medium text-foreground hover:underline">
            Configurações
          </Link>
          .
        </p>
      )}

      <Modal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={current && current !== "new" ? `Editar ${current.name}` : "Novo plano"}
        description="Preço, limites e recursos."
        icon={<Layers />}
        size="lg"
        bare
      >
        {current && data && (
          <PlanForm
            key={current === "new" ? "new" : current.id}
            plan={current === "new" ? null : current}
            defaults={data.defaultLimits}
            onDone={(ok) => {
              setEditing(null)
              if (ok) {
                reload()
                refresh()
              }
            }}
          />
        )}
      </Modal>
      <ConfirmAction request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
