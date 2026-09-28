"use client"

import { useRouter } from "next/navigation"
import { UsersRound } from "lucide-react"
import { toast } from "sonner"
import { Modal } from "@/components/ui/modal"
import { ClientForm } from "./client-form"
import { useDemoActions } from "@/lib/store/demo-store"

export function NewClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { addClient } = useDemoActions()
  const router = useRouter()
  const close = () => onOpenChange(false)

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo cliente"
      description="Cadastre um cliente para vincular processos, tarefas, documentos e honorários."
      icon={<UsersRound />}
      size="lg"
      bare
    >
      <ClientForm
        submitLabel="Cadastrar cliente"
        onCancel={close}
        onSubmit={(payload) => {
          const client = addClient(payload)
          close()
          toast.success("Cliente cadastrado.", {
            description: `${client.name} já está disponível na base do escritório.`,
            action: { label: "Abrir perfil", onClick: () => router.push(`/clientes/${client.id}`) },
          })
        }}
      />
    </Modal>
  )
}
