"use client"

import * as React from "react"
import { CircleCheck, Pause, Power, RotateCcw } from "lucide-react"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { maskDocument, maskPhone } from "@/lib/masks"
import {
  formatCents,
  formatLimitValue,
  LIMIT_KEYS,
  LIMIT_META,
  ORG_STATUS,
  SUBSCRIPTION_STATUS,
  type AdminOrganization,
  type AdminPlan,
  type LimitKey,
  type OrgStatus,
  type PlanLimits,
  type SubscriptionStatus,
} from "@/lib/admin/catalog"
import { OrgStatusBadge } from "../ui/badges"

type Actions = {
  patch: (org: AdminOrganization, body: Record<string, unknown>, message: string) => Promise<void>
  setStatus: (org: AdminOrganization, status: OrgStatus) => void
  setPlan: (org: AdminOrganization, plan: string) => void
}

const ymd = (iso?: string) => (iso ? iso.slice(0, 10) : "")

function SaveBar({ dirty, busy, onReset }: { dirty: boolean; busy: boolean; onReset: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
      {dirty && (
        <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={busy}>
          Descartar
        </Button>
      )}
      <Button type="submit" size="sm" disabled={!dirty || busy}>
        {busy ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  )
}

function useForm<T extends Record<string, unknown>>(initial: T) {
  const [form, setForm] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof T>(key: K, value: T[K]) => setForm((f) => ({ ...f, [key]: value }))
  return { form, set, setForm, busy, setBusy, dirty, reset: () => setForm(initial) }
}

function DataForm({ org, actions }: { org: AdminOrganization; actions: Actions }) {
  const f = useForm({ name: org.name, legalName: org.legalName, cnpj: org.cnpj, email: org.email, phone: org.phone, city: org.city, address: org.address })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    f.setBusy(true)
    await actions.patch(org, f.form, "Dados do escritório salvos.").catch(() => undefined)
    f.setBusy(false)
  }
  return (
    <Panel>
      <PanelHeader title="Dados do escritório" description="Os mesmos dados que o sócio vê em Configurações no CRM." />
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Nome fantasia" htmlFor="oc-name">
            <TextInput id="oc-name" value={f.form.name} onChange={(e) => f.set("name", e.target.value)} />
          </Field>
          <Field label="CNPJ/CPF" htmlFor="oc-cnpj">
            <TextInput id="oc-cnpj" inputMode="numeric" value={f.form.cnpj} onChange={(e) => f.set("cnpj", maskDocument(e.target.value))} />
          </Field>
          <Field label="Razão social" htmlFor="oc-legal" className="sm:col-span-2">
            <TextInput id="oc-legal" value={f.form.legalName} onChange={(e) => f.set("legalName", e.target.value)} />
          </Field>
          <Field label="E-mail" htmlFor="oc-email">
            <TextInput id="oc-email" type="email" value={f.form.email} onChange={(e) => f.set("email", e.target.value)} />
          </Field>
          <Field label="Telefone" htmlFor="oc-phone">
            <TextInput id="oc-phone" inputMode="tel" value={f.form.phone} onChange={(e) => f.set("phone", maskPhone(e.target.value))} />
          </Field>
          <Field label="Cidade" htmlFor="oc-city">
            <TextInput id="oc-city" value={f.form.city} onChange={(e) => f.set("city", e.target.value)} />
          </Field>
          <Field label="Endereço" htmlFor="oc-address">
            <TextInput id="oc-address" value={f.form.address} onChange={(e) => f.set("address", e.target.value)} />
          </Field>
        </div>
        <SaveBar dirty={f.dirty} busy={f.busy} onReset={f.reset} />
      </form>
    </Panel>
  )
}

function PlanForm({ org, plans, actions }: { org: AdminOrganization; plans: AdminPlan[]; actions: Actions }) {
  const sub = org.subscription
  const f = useForm({ status: (sub?.status ?? "trialing") as SubscriptionStatus, trialEndsAt: ymd(sub?.trialEndsAt) })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    f.setBusy(true)
    await actions
      .patch(org, { subscription: { status: f.form.status, trialEndsAt: f.form.trialEndsAt ? `${f.form.trialEndsAt}T23:59:59` : null } }, "Assinatura atualizada.")
      .catch(() => undefined)
    f.setBusy(false)
  }
  const current = plans.find((p) => p.name === org.plan)
  return (
    <Panel>
      <PanelHeader title="Plano e assinatura" description="Sem gateway conectado, a assinatura é controlada manualmente aqui." />
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field
            label="Plano"
            htmlFor="oc-plan"
            hint={current ? `${current.priceCents ? formatCents(current.priceCents) : "Sem preço"} / ${current.interval === "year" ? "ano" : "mês"}` : undefined}
            className="sm:col-span-2"
          >
            <NativeSelect id="oc-plan" value={org.plan} onChange={(e) => actions.setPlan(org, e.target.value)}>
              {plans
                .filter((p) => p.status === "active" || p.name === org.plan)
                .map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                    {p.status !== "active" ? " (desativado)" : ""}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Situação da assinatura" htmlFor="oc-sub">
            <NativeSelect id="oc-sub" value={f.form.status} onChange={(e) => f.set("status", e.target.value as SubscriptionStatus)}>
              {(Object.keys(SUBSCRIPTION_STATUS) as SubscriptionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SUBSCRIPTION_STATUS[s].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Fim do teste" htmlFor="oc-trial" optional>
            <TextInput id="oc-trial" type="date" value={f.form.trialEndsAt} onChange={(e) => f.set("trialEndsAt", e.target.value)} />
          </Field>
        </div>
        <SaveBar dirty={f.dirty} busy={f.busy} onReset={f.reset} />
      </form>
    </Panel>
  )
}

const GB = 1024

function LimitsForm({ org, plan, actions }: { org: AdminOrganization; plan: AdminPlan | null; actions: Actions }) {
  const base: PlanLimits = plan?.limits ?? { users: null, processes: null, clients: null, storage: null, whatsapp: null, ai: null }
  const initial = Object.fromEntries(
    LIMIT_KEYS.map((k) => {
      const custom = org.customLimits && k in org.customLimits
      const v = custom ? (org.customLimits![k] ?? null) : null
      return [k, { custom: !!custom, unlimited: custom && v === null, value: v === null ? "" : String(k === "storage" ? +(v / GB).toFixed(2) : v) }]
    }),
  ) as Record<LimitKey, { custom: boolean; unlimited: boolean; value: string }>
  const f = useForm(initial)
  const setKey = (k: LimitKey, patch: Partial<(typeof initial)[LimitKey]>) => f.setForm((s) => ({ ...s, [k]: { ...s[k], ...patch } }))

  const save = async (reset: boolean) => {
    const customLimits = reset
      ? null
      : Object.fromEntries(
          LIMIT_KEYS.filter((k) => f.form[k].custom).map((k) => {
            const { unlimited, value } = f.form[k]
            const n = Number(value.replace(",", "."))
            return [k, unlimited || value === "" || !Number.isFinite(n) ? null : k === "storage" ? Math.round(n * GB) : Math.round(n)]
          }),
        )
    f.setBusy(true)
    await actions.patch(org, { customLimits }, reset ? "Limites voltaram aos do plano." : "Limites salvos.").catch(() => undefined)
    f.setBusy(false)
  }

  return (
    <Panel>
      <PanelHeader
        title="Limites"
        description={`Por padrão valem os do plano ${org.plan}. Personalize só o que precisar.`}
        action={
          org.customLimits && (
            <Button size="sm" variant="ghost" onClick={() => save(true)} disabled={f.busy}>
              <RotateCcw /> Usar os do plano
            </Button>
          )
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save(false)
        }}
        noValidate
      >
        <ul className="divide-y divide-border border-t border-border">
          {LIMIT_KEYS.map((k) => {
            const row = f.form[k]
            const unit = k === "storage" ? "GB" : LIMIT_META[k].monthly ? "por mês" : ""
            return (
              <li key={k} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{LIMIT_META[k].label}</p>
                  <p className="text-[12px] text-muted-foreground">Plano: {formatLimitValue(k, base[k])}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <ToggleSwitch label={`Personalizar ${LIMIT_META[k].label}`} checked={row.custom} onChange={(v) => setKey(k, { custom: v })} />
                    Personalizar
                  </label>
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      aria-label={`${LIMIT_META[k].label} personalizado`}
                      inputMode="decimal"
                      disabled={!row.custom || row.unlimited}
                      placeholder={row.custom ? (row.unlimited ? "∞" : "0") : "—"}
                      value={row.unlimited ? "" : row.value}
                      onChange={(e) => setKey(k, { value: e.target.value.replace(/[^\d.,]/g, "") })}
                      className="w-24 text-right tabular"
                    />
                    <span className="w-14 text-[11.5px] text-subtle">{unit}</span>
                  </div>
                  <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--brand)]"
                      disabled={!row.custom}
                      checked={row.unlimited}
                      onChange={(e) => setKey(k, { unlimited: e.target.checked })}
                    />
                    Ilimitado
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
        <SaveBar dirty={f.dirty} busy={f.busy} onReset={f.reset} />
      </form>
    </Panel>
  )
}

function StatusPanel({ org, actions }: { org: AdminOrganization; actions: Actions }) {
  const f = useForm({ adminNotes: org.adminNotes ?? "" })
  return (
    <Panel>
      <PanelHeader title="Status e notas internas" description={ORG_STATUS[org.status].description} action={<OrgStatusBadge status={org.status} />} />
      {org.statusReason && org.status !== "active" && (
        <p className="mx-5 mb-3 rounded-control bg-surface-muted/70 px-3 py-2 text-[12.5px] text-muted-foreground">
          <strong className="font-medium text-foreground">Motivo:</strong> {org.statusReason}
        </p>
      )}
      <div className="flex flex-wrap gap-2 px-5 pb-4">
        {org.status !== "active" && (
          <Button size="sm" onClick={() => actions.setStatus(org, "active")}>
            <CircleCheck /> {org.status === "pending" ? "Aprovar" : "Ativar"}
          </Button>
        )}
        {org.status === "active" && (
          <Button size="sm" variant="secondary" onClick={() => actions.setStatus(org, "suspended")}>
            <Pause /> Suspender
          </Button>
        )}
        {org.status !== "inactive" && (
          <Button size="sm" variant="destructive" onClick={() => actions.setStatus(org, "inactive")}>
            <Power /> {org.status === "pending" ? "Recusar cadastro" : "Desativar"}
          </Button>
        )}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          f.setBusy(true)
          await actions.patch(org, { adminNotes: f.form.adminNotes }, "Notas salvas.").catch(() => undefined)
          f.setBusy(false)
        }}
      >
        <div className="border-t border-border px-5 pt-4 pb-5">
          <Field label="Notas internas" htmlFor="oc-notes" hint="Visível só para o Super Admin. Ex.: negociação, contato preferido, histórico.">
            <TextArea id="oc-notes" value={f.form.adminNotes} maxLength={2000} onChange={(e) => f.set("adminNotes", e.target.value)} />
          </Field>
        </div>
        <SaveBar dirty={f.dirty} busy={f.busy} onReset={f.reset} />
      </form>
    </Panel>
  )
}

/** Aba Configurações do escritório: dados, plano/assinatura, limites e status. */
export function OrganizationConfig({ org, plan, plans, actions }: { org: AdminOrganization; plan: AdminPlan | null; plans: AdminPlan[]; actions: Actions }) {
  // `key` recria os formulários quando os dados salvos mudam (valores iniciais novos).
  const version = JSON.stringify([org.name, org.plan, org.status, org.subscription, org.customLimits, org.adminNotes, org.cnpj, org.email, org.phone])
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <DataForm key={`d-${version}`} org={org} actions={actions} />
        <StatusPanel key={`s-${version}`} org={org} actions={actions} />
      </div>
      <div className="space-y-5">
        <PlanForm key={`p-${version}`} org={org} plans={plans} actions={actions} />
        <LimitsForm key={`l-${version}`} org={org} plan={plan} actions={actions} />
      </div>
    </div>
  )
}
