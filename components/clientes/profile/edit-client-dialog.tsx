"use client"

import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { Modal } from "@/components/ui/modal"
import { ClientForm } from "@/components/clientes/client-form"
import type { Client } from "@/types"

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
  const close = () => onOpenChange(false)
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Editar cliente" description={client.name} icon={<Pencil />} size="lg" bare>
      <ClientForm
        client={client}
        submitLabel="Salvar alterações"
        onCancel={close}
        onSubmit={(payload) => {
          onSave(payload)
          close()
          toast.success("Alterações salvas.", { description: payload.name })
        }}
      />
    </Modal>
  )
}
