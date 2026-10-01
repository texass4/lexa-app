"use client"

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { ModalBody, ModalFooter } from "@/components/ui/modal"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { adminFetch } from "@/lib/admin/client"
import { isEmail } from "@/lib/auth/validation"
import { maskDocument } from "@/lib/core/masks"
import { formatCents, type AdminPlan } from "@/lib/admin/catalog"

/** Novo escritório criado pelo Admin: já nasce ativo e o sócio recebe convite. */
export function NewOfficeForm({ plans, onDone }: { plans: AdminPlan[]; onDone: (created: boolean) => void }) {
  const active = plans.filter((p) => p.status === "active")
  const [form, setForm] = React.useState({
    name: "",
    cnpj: "",
    email: "",
    plan: active[0]?.name ?? "",
    ownerName: "",
    ownerEmail: "",
    skipTrial: false,
  })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return setError("Informe o nome do escritório.")
    if (form.ownerName.trim().length < 3) return setError("Informe o nome do sócio.")
    if (!isEmail(form.ownerEmail.trim())) return setError("E-mail do sócio inválido.")
    setError("")
    setBusy(true)
    try {
      const { email } = await adminFetch<{ email?: { sent: boolean; message?: string } }>("/api/admin/organizations", "POST", form)
      if (email?.sent) toast.success("Escritório criado.", { description: `${form.ownerEmail} recebeu o convite.` })
      else
        toast.warning("Escritório criado, mas o convite não foi enviado por e-mail.", {
          description: `${email?.message ?? ""} Reenvie o convite na equipe do escritório.`.trim(),
        })
      onDone(true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <ModalBody>
        <form id="new-office-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {error && (
            <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:col-span-2">
              {error}
            </p>
          )}
          <Field label="Nome do escritório" htmlFor="no-name" className="sm:col-span-2">
            <TextInput id="no-name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="CNPJ/CPF" htmlFor="no-cnpj" optional>
            <TextInput id="no-cnpj" inputMode="numeric" value={form.cnpj} onChange={(e) => set("cnpj", maskDocument(e.target.value))} />
          </Field>
          <Field label="E-mail do escritório" htmlFor="no-email" optional>
            <TextInput id="no-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Nome do Sócio/Proprietário" htmlFor="no-owner">
            <TextInput id="no-owner" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          </Field>
          <Field label="E-mail do Sócio/Proprietário" htmlFor="no-owner-email" hint="Recebe o link para criar a senha.">
            <TextInput id="no-owner-email" type="email" value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
          </Field>
          <Field label="Plano" htmlFor="no-plan" className="sm:col-span-2">
            <NativeSelect id="no-plan" value={form.plan} onChange={(e) => set("plan", e.target.value)}>
              {active.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} — {p.priceCents ? `${formatCents(p.priceCents)}/${p.interval === "year" ? "ano" : "mês"}` : "sem preço definido"}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center justify-between gap-4 rounded-[10px] border border-border bg-surface-muted/40 px-3.5 py-3 sm:col-span-2">
            <span>
              <span className="block text-[13px] font-medium">Começar já como assinante</span>
              <span className="block text-[12px] text-muted-foreground">Desligado, o escritório começa no período de teste configurado.</span>
            </span>
            <ToggleSwitch label="Começar já como assinante" checked={form.skipTrial} onChange={(v) => set("skipTrial", v)} />
          </label>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => onDone(false)}>
          Cancelar
        </Button>
        <Button type="submit" form="new-office-form" disabled={busy || !active.length}>
          {busy ? "Criando…" : "Criar e convidar"}
        </Button>
      </ModalFooter>
    </>
  )
}
