"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ModalBody, ModalFooter } from "@/components/ui/modal"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Eyebrow } from "@/components/ui/panel"
import { TagInput } from "./tag-input"
import { CLIENT_STATUS, PRACTICE_AREAS } from "@/lib/config"
import { currentUserId, getMembers, getUser } from "@/lib/account"
import { useDemoData } from "@/lib/store/demo-store"
import { maskDocument, maskPhone } from "@/lib/masks"
import { getNow, toLocalISO } from "@/lib/dates"
import { UFS, formatAddress, knownTags, maskZipCode, normalizeTags, validateClientForm, type ClientFormErrors } from "@/lib/clients"
import type { Client, ClientAddress, ClientStatus, PracticeArea } from "@/types"

const KINDS = ["Pessoa física", "Pessoa jurídica"] as const
/** Texto que o cadastro antigo gravava no lugar de um endereço vazio. */
const LEGACY_EMPTY_ADDRESS = "Endereço a completar"

function initialState(client?: Client) {
  const a = client?.addressDetails
  const legacyAddress = !a && client?.address && client.address !== LEGACY_EMPTY_ADDRESS ? client.address : ""
  return {
    kind: (client?.kind === "PJ" ? "Pessoa jurídica" : "Pessoa física") as (typeof KINDS)[number],
    name: client?.name ?? "",
    document: client?.document ?? "",
    birthDate: client?.birthDate ?? "",
    phone: client?.phone ?? "",
    whatsapp: client?.whatsapp ?? "",
    email: client?.email ?? "",
    zipCode: a?.zipCode ?? "",
    // Cadastro antigo: o endereço em uma linha vai para "Logradouro", para não se perder.
    street: a?.street ?? legacyAddress,
    number: a?.number ?? "",
    complement: a?.complement ?? "",
    district: a?.district ?? "",
    city: a?.city ?? "",
    state: a?.state ?? "",
    area: client?.area ?? ("Previdenciário" as PracticeArea),
    // Responsável que saiu do escritório não aparece na lista — mantém o atual até trocar.
    ownerId: client?.ownerId ?? currentUserId(),
    status: client?.status ?? ("novo" as ClientStatus),
    tags: client?.tags ?? [],
    notes: client?.notes ?? "",
    contactName: client?.contact?.name ?? "",
    contactRelation: client?.contact?.relation ?? "",
    contactPhone: client?.contact?.phone ?? "",
    contactEmail: client?.contact?.email ?? "",
  }
}

type FormState = ReturnType<typeof initialState>
export type ClientPayload = Omit<Client, "id" | "organizationId" | "createdAt" | "clientSince" | "lastActivityAt" | "updatedAt" | "source">

const blank = (v: string) => v.trim() || undefined

function toPayload(form: FormState, client?: Client): ClientPayload {
  const pj = form.kind === "Pessoa jurídica"
  const details: ClientAddress = {
    zipCode: blank(form.zipCode),
    street: blank(form.street),
    number: blank(form.number),
    complement: blank(form.complement),
    district: blank(form.district),
    city: blank(form.city),
    state: blank(form.state.toUpperCase()),
  }
  const hasAddress = Object.values(details).some(Boolean)
  const hasContact = !!form.contactName.trim()
  return {
    kind: pj ? "PJ" : "PF",
    name: form.name.trim().replace(/\s+/g, " "),
    document: maskDocument(form.document),
    birthDate: form.birthDate || undefined,
    phone: form.phone,
    whatsapp: form.whatsapp || undefined,
    email: form.email.trim().toLowerCase(),
    address: formatAddress(details),
    addressDetails: hasAddress ? (Object.fromEntries(Object.entries(details).filter(([, v]) => v)) as ClientAddress) : undefined,
    area: form.area,
    ownerId: form.ownerId,
    status: form.status,
    tags: form.tags.length ? normalizeTags(form.tags) : undefined,
    notes: blank(form.notes),
    profession: client?.profession,
    contact: hasContact
      ? {
          name: form.contactName.trim(),
          relation: form.contactRelation.trim() || (pj ? "Representante" : "Contato"),
          phone: form.contactPhone,
          email: blank(form.contactEmail),
        }
      : undefined,
  }
}

/**
 * Formulário único de cadastro e edição de cliente. Valida CPF/CNPJ (dígitos e
 * duplicidade no escritório), e-mail, telefones e datas; o banco repete a checagem
 * do documento (`0002_clients_hub.sql`).
 */
export function ClientForm({
  client,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  client?: Client
  submitLabel: string
  onCancel: () => void
  onSubmit: (payload: ClientPayload) => void
}) {
  const { clients } = useDemoData()
  const [form, setForm] = React.useState(() => initialState(client))
  const [errors, setErrors] = React.useState<ClientFormErrors>({})
  const suggestions = React.useMemo(() => knownTags(clients), [clients])
  const pj = form.kind === "Pessoa jurídica"
  const members = getMembers()
  const ownerMissing = !members.some((m) => m.id === form.ownerId)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next = validateClientForm(
      {
        kind: pj ? "PJ" : "PF",
        name: form.name,
        document: form.document,
        email: form.email,
        phone: form.phone,
        whatsapp: form.whatsapp,
        birthDate: form.birthDate,
        state: form.state,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
      },
      clients,
      toLocalISO(getNow()).slice(0, 10),
      client?.id,
    )
    setErrors(next)
    const first = Object.keys(next)[0]
    if (first) {
      document.getElementById(`client-${first}`)?.focus()
      return
    }
    onSubmit(toPayload(form, client))
  }

  return (
    <>
      <ModalBody>
        <form id="client-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Eyebrow className="sm:col-span-2">Identificação</Eyebrow>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[12.5px] font-medium">Tipo de cliente</span>
            <ChoiceChips
              ariaLabel="Tipo de cliente"
              options={KINDS}
              value={form.kind}
              onChange={(v) => {
                set("kind", v)
                setErrors((e) => ({ ...e, document: undefined, name: undefined }))
              }}
            />
          </div>
          <Field label={pj ? "Razão social" : "Nome completo"} htmlFor="client-name" error={errors.name} className="sm:col-span-2">
            <TextInput id="client-name" autoFocus value={form.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={pj ? "CNPJ" : "CPF"} htmlFor="client-document" error={errors.document}>
            <TextInput
              id="client-document"
              inputMode="numeric"
              placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
              value={form.document}
              aria-invalid={!!errors.document}
              onChange={(e) => set("document", maskDocument(e.target.value.replace(/\D/g, "").slice(0, pj ? 14 : 11)))}
            />
          </Field>
          <Field label={pj ? "Data de fundação" : "Data de nascimento"} htmlFor="client-birthDate" error={errors.birthDate} optional>
            <TextInput
              id="client-birthDate"
              type="date"
              value={form.birthDate}
              aria-invalid={!!errors.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
            />
          </Field>

          <Eyebrow className="mt-2 sm:col-span-2">Contato</Eyebrow>
          <Field label="Telefone" htmlFor="client-phone" error={errors.phone} optional>
            <TextInput
              id="client-phone"
              inputMode="tel"
              placeholder="(48) 99999-0000"
              value={form.phone}
              aria-invalid={!!errors.phone}
              onChange={(e) => set("phone", maskPhone(e.target.value))}
            />
          </Field>
          <Field label="WhatsApp" htmlFor="client-whatsapp" error={errors.whatsapp} hint="Deixe vazio se for o mesmo celular." optional>
            <TextInput
              id="client-whatsapp"
              inputMode="tel"
              placeholder="(48) 99999-0000"
              value={form.whatsapp}
              aria-invalid={!!errors.whatsapp}
              onChange={(e) => set("whatsapp", maskPhone(e.target.value))}
            />
          </Field>
          <Field label="E-mail" htmlFor="client-email" error={errors.email} optional className="sm:col-span-2">
            <TextInput
              id="client-email"
              type="email"
              value={form.email}
              aria-invalid={!!errors.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>

          <Eyebrow className="mt-2 sm:col-span-2">Endereço</Eyebrow>
          <Field label="CEP" htmlFor="client-zip" optional>
            <TextInput
              id="client-zip"
              inputMode="numeric"
              placeholder="00000-000"
              value={form.zipCode}
              onChange={(e) => set("zipCode", maskZipCode(e.target.value))}
            />
          </Field>
          <Field label="Logradouro" htmlFor="client-street" optional>
            <TextInput id="client-street" placeholder="Rua, avenida…" value={form.street} onChange={(e) => set("street", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Número" htmlFor="client-number" optional>
              <TextInput id="client-number" value={form.number} onChange={(e) => set("number", e.target.value)} />
            </Field>
            <Field label="Complemento" htmlFor="client-complement" optional>
              <TextInput id="client-complement" value={form.complement} onChange={(e) => set("complement", e.target.value)} />
            </Field>
          </div>
          <Field label="Bairro" htmlFor="client-district" optional>
            <TextInput id="client-district" value={form.district} onChange={(e) => set("district", e.target.value)} />
          </Field>
          <Field label="Cidade" htmlFor="client-city" optional>
            <TextInput id="client-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="UF" htmlFor="client-state" error={errors.state} optional>
            <NativeSelect
              id="client-state"
              value={form.state.toUpperCase()}
              aria-invalid={!!errors.state}
              onChange={(e) => set("state", e.target.value)}
            >
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </NativeSelect>
          </Field>

          <Eyebrow className="mt-2 sm:col-span-2">Escritório</Eyebrow>
          <Field label="Área principal" htmlFor="client-area">
            <NativeSelect id="client-area" value={form.area} onChange={(e) => set("area", e.target.value as PracticeArea)}>
              {PRACTICE_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Responsável" htmlFor="client-owner">
            <NativeSelect id="client-owner" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              {ownerMissing && <option value={form.ownerId}>{getUser(form.ownerId).name}</option>}
              {members.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="client-status">
            <NativeSelect id="client-status" value={form.status} onChange={(e) => set("status", e.target.value as ClientStatus)}>
              {(Object.keys(CLIENT_STATUS) as ClientStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS[s].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Tags" htmlFor="client-tags" optional className="sm:col-span-2">
            <TagInput id="client-tags" value={form.tags} onChange={(tags) => set("tags", tags)} suggestions={suggestions} />
          </Field>
          <Field label="Observações" htmlFor="client-notes" optional className="sm:col-span-2">
            <TextArea id="client-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {(pj || client?.contact) && (
            <>
              <Eyebrow className="mt-2 sm:col-span-2">Contato principal</Eyebrow>
              <Field label="Nome" htmlFor="client-contactName" optional>
                <TextInput id="client-contactName" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
              </Field>
              <Field label={pj ? "Cargo" : "Relação"} htmlFor="client-contactRelation" optional>
                <TextInput
                  id="client-contactRelation"
                  placeholder={pj ? "Ex.: Sócio-administrador" : "Ex.: Filha"}
                  value={form.contactRelation}
                  onChange={(e) => set("contactRelation", e.target.value)}
                />
              </Field>
              <Field label="Telefone" htmlFor="client-contactPhone" error={errors.contactPhone} optional>
                <TextInput
                  id="client-contactPhone"
                  inputMode="tel"
                  value={form.contactPhone}
                  aria-invalid={!!errors.contactPhone}
                  onChange={(e) => set("contactPhone", maskPhone(e.target.value))}
                />
              </Field>
              <Field label="E-mail" htmlFor="client-contactEmail" error={errors.contactEmail} optional>
                <TextInput
                  id="client-contactEmail"
                  type="email"
                  value={form.contactEmail}
                  aria-invalid={!!errors.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                />
              </Field>
            </>
          )}
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" form="client-form">
          {submitLabel}
        </Button>
      </ModalFooter>
    </>
  )
}
