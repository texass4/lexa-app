"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { UsersRound } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { PRACTICE_AREAS } from "@/lib/config"
import { users, CURRENT_USER_ID } from "@/lib/account"
import { useDemoActions } from "@/lib/store/demo-store"
import { isEmail, maskDocument, maskPhone } from "@/lib/masks"
import type { PracticeArea } from "@/types"

const KINDS = ["Pessoa física", "Pessoa jurídica"] as const

const empty = () => ({
  name: "",
  kind: "Pessoa física" as (typeof KINDS)[number],
  document: "",
  email: "",
  phone: "",
  address: "",
  area: "Previdenciário" as PracticeArea,
  ownerId: CURRENT_USER_ID,
})

type FormState = ReturnType<typeof empty>

function NewClientForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = React.useState(empty)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const { addClient } = useDemoActions()
  const router = useRouter()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const pj = form.kind === "Pessoa jurídica"

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 3) next.name = pj ? "Informe a razão social." : "Informe o nome completo."
    const digits = form.document.replace(/\D/g, "").length
    if (digits !== (pj ? 14 : 11)) next.document = pj ? "CNPJ deve ter 14 dígitos." : "CPF deve ter 11 dígitos."
    if (form.email && !isEmail(form.email)) next.email = "E-mail inválido."
    setErrors(next)
    if (Object.keys(next).length) return

    const client = addClient({
      name: form.name.trim(),
      kind: pj ? "PJ" : "PF",
      document: form.document,
      email: form.email,
      phone: form.phone,
      address: form.address || "Endereço a completar",
      area: form.area,
      ownerId: form.ownerId,
    })
    onClose()
    toast.success("Cliente cadastrado.", {
      description: `${client.name} já está disponível na base do escritório.`,
      action: { label: "Abrir perfil", onClick: () => router.push(`/clientes/${client.id}`) },
    })
  }

  return (
    <>
      <ModalBody>
        <form id="new-client-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[12.5px] font-medium">Tipo de cliente</span>
            <ChoiceChips ariaLabel="Tipo de cliente" options={KINDS} value={form.kind} onChange={(v) => set("kind", v)} />
          </div>
          <Field label={pj ? "Razão social" : "Nome completo"} htmlFor="client-name" error={errors.name} className="sm:col-span-2">
            <TextInput id="client-name" autoFocus value={form.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={pj ? "CNPJ" : "CPF"} htmlFor="client-doc" error={errors.document}>
            <TextInput
              id="client-doc"
              inputMode="numeric"
              placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
              value={form.document}
              aria-invalid={!!errors.document}
              onChange={(e) => set("document", maskDocument(e.target.value))}
            />
          </Field>
          <Field label="Telefone" htmlFor="client-phone" optional>
            <TextInput
              id="client-phone"
              inputMode="tel"
              placeholder="(48) 99999-0000"
              value={form.phone}
              onChange={(e) => set("phone", maskPhone(e.target.value))}
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
          <Field label="Endereço" htmlFor="client-address" optional className="sm:col-span-2">
            <TextInput
              id="client-address"
              placeholder="Rua, número — bairro, cidade/UF"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <Field label="Área principal" htmlFor="client-area">
            <NativeSelect id="client-area" value={form.area} onChange={(e) => set("area", e.target.value as PracticeArea)}>
              {PRACTICE_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Responsável" htmlFor="client-owner">
            <NativeSelect id="client-owner" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="new-client-form">
          Cadastrar cliente
        </Button>
      </ModalFooter>
    </>
  )
}

export function NewClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo cliente"
      description="Cadastre um cliente para vincular processos, documentos e honorários."
      icon={<UsersRound />}
      bare
    >
      <NewClientForm onClose={() => onOpenChange(false)} />
    </Modal>
  )
}
