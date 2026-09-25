"use client"

import * as React from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { users } from "@/lib/account"
import { maskPhone } from "@/lib/masks"
import type { Client } from "@/types"

function EditClientForm({ client, onClose, onSave }: { client: Client; onClose: () => void; onSave: (patch: Partial<Client>) => void }) {
  const [form, setForm] = React.useState({ phone: client.phone, email: client.email, address: client.address, ownerId: client.ownerId })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form)
    onClose()
    toast.success("Alterações salvas.", { description: client.name })
  }

  return (
    <>
      <ModalBody>
        <form id="edit-client-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Telefone" htmlFor="edit-phone">
            <TextInput id="edit-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))} />
          </Field>
          <Field label="E-mail" htmlFor="edit-email">
            <TextInput id="edit-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Endereço" htmlFor="edit-address" className="sm:col-span-2">
            <TextInput id="edit-address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </Field>
          <Field label="Responsável" htmlFor="edit-owner" className="sm:col-span-2">
            <NativeSelect id="edit-owner" value={form.ownerId} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}>
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
        <Button type="submit" form="edit-client-form">
          Salvar alterações
        </Button>
      </ModalFooter>
    </>
  )
}

export function EditClientDialog({
  client,
  open,
  onOpenChange,
  onSave,
}: {
  client: Client
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (patch: Partial<Client>) => void
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Editar cliente" description={client.name} icon={<Pencil />} bare>
      <EditClientForm client={client} onClose={() => onOpenChange(false)} onSave={onSave} />
    </Modal>
  )
}
