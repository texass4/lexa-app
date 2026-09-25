"use client"

import * as React from "react"
import { toast } from "sonner"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/field"
import { Tag } from "@/components/ui/status-badge"
import { useSession } from "@/lib/auth/session"
import { getSupabase } from "@/lib/supabase/client"
import { PRACTICE_AREAS } from "@/lib/config"
import { maskDocument, maskPhone } from "@/lib/masks"

export function OfficeSection() {
  const { organization, members, can, refresh } = useSession()
  const editable = can("office.manage")
  const initial = {
    name: organization.name,
    cnpj: organization.cnpj,
    legalName: organization.legalName,
    address: organization.address,
    city: organization.city,
    phone: organization.phone,
    email: organization.email,
  }
  const [form, setForm] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== initial[k])
  const active = members.filter((m) => m.active).length

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return toast.error("Informe o nome do escritório.")
    setBusy(true)
    const { error } = await getSupabase()
      .from("organizations")
      .update({
        name: form.name.trim(),
        cnpj: form.cnpj || null,
        legal_name: form.legalName.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        phone: form.phone || null,
        email: form.email.trim() || null,
      })
      .eq("id", organization.id)
    setBusy(false)
    if (error) return toast.error("Não foi possível salvar os dados do escritório.")
    await refresh()
    toast.success("Dados do escritório salvos.")
  }

  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-1 bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklab,var(--gold)_12%,transparent),transparent_60%)] p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold-dark">Plano {organization.plan}</p>
          <p className="text-[15px] font-semibold">
            {active} {active === 1 ? "usuário ativo" : "usuários ativos"}
          </p>
          <p className="text-[12.5px] text-muted-foreground">Para mudar de plano, fale com a equipe do LEXA.</p>
        </div>
      </Panel>
      <Panel>
        <PanelHeader
          title="Dados do escritório"
          description={
            editable ? "Utilizados em contratos, procurações e comunicações." : "Somente quem administra o escritório pode alterar estes dados."
          }
        />
        <form onSubmit={submit} noValidate>
          <fieldset disabled={!editable} className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Nome fantasia" htmlFor="o-name">
              <TextInput id="o-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="CNPJ" htmlFor="o-cnpj">
              <TextInput id="o-cnpj" inputMode="numeric" value={form.cnpj} onChange={(e) => set("cnpj", maskDocument(e.target.value))} />
            </Field>
            <Field label="Razão social" htmlFor="o-legal" className="sm:col-span-2">
              <TextInput id="o-legal" value={form.legalName} onChange={(e) => set("legalName", e.target.value)} />
            </Field>
            <Field label="Endereço" htmlFor="o-address" className="sm:col-span-2">
              <TextInput id="o-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Cidade" htmlFor="o-city">
              <TextInput id="o-city" placeholder="Florianópolis, SC" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Telefone" htmlFor="o-phone">
              <TextInput id="o-phone" inputMode="tel" value={form.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} />
            </Field>
            <Field label="E-mail" htmlFor="o-email" className="sm:col-span-2">
              <TextInput id="o-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-[12.5px] font-medium">Áreas de atuação</p>
              <div className="flex flex-wrap gap-1.5">
                {PRACTICE_AREAS.map((a) => (
                  <Tag key={a}>{a}</Tag>
                ))}
              </div>
            </div>
          </fieldset>
          {editable && (
            <div className="flex justify-end border-t border-border px-5 py-3.5">
              <Button type="submit" disabled={busy || !dirty}>
                {busy ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          )}
        </form>
      </Panel>
    </div>
  )
}
