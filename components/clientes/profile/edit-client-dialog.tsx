"use client"

import * as React from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { Modal } from "@/components/ui/modal"
import { ClientForm } from "@/components/clientes/client-form"
import { useOfficeActions, type SaveOptions, type SaveResult } from "@/lib/store/office-store"
import { useRemovedWhileEditing } from "@/lib/store/on-demand"
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
  onSave: (patch: Partial<Client>, options: SaveOptions) => Promise<SaveResult<Client>>
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Editar cliente" description={client.name} icon={<Pencil />} size="lg" bare>
      <EditClientBody client={client} onClose={() => onOpenChange(false)} onSave={onSave} />
    </Modal>
  )
}

/** Montado a cada abertura: guarda a versão do cliente que o formulário mostra. */
function EditClientBody({
  client,
  onClose,
  onSave,
}: {
  client: Client
  onClose: () => void
  onSave: (patch: Partial<Client>, options: SaveOptions) => Promise<SaveResult<Client>>
}) {
  const { versionOf } = useOfficeActions()
  const [editing, setEditing] = React.useState(() => ({ client, baseVersion: versionOf("clients", client.id), revision: 0 }))
  useRemovedWhileEditing("clients", client.id)
  const saving = React.useRef(false)

  return (
    <ClientForm
      // Depois de um conflito, o formulário recomeça com o cadastro atual.
      key={editing.revision}
      client={editing.client}
      submitLabel="Salvar alterações"
      onCancel={onClose}
      onSubmit={async (payload) => {
        if (saving.current) return
        saving.current = true
        const result = await onSave(payload, { baseVersion: editing.baseVersion })
        saving.current = false
        if (result.status === "conflict") {
          setEditing((e) => ({ client: result.current, baseVersion: versionOf("clients", client.id), revision: e.revision + 1 }))
          return
        }
        if (result.status === "error") return
        onClose()
        if (result.status === "saved") toast.success("Alterações salvas.", { description: payload.name })
      }}
    />
  )
}
