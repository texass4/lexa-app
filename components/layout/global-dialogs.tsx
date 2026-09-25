"use client"

import { useUI } from "@/lib/store/ui-store"
import { NewClientDialog } from "@/components/clientes/new-client-dialog"
import { TaskFormDialog } from "@/components/tasks/task-form-dialog"
import { NewAppointmentDialog } from "@/components/agenda/new-appointment-dialog"
import { NewDocumentDialog } from "@/components/documentos/new-document-dialog"
import { NewProcessDialog } from "@/components/processos/new-process-dialog"

export function GlobalDialogs() {
  const { dialog, closeDialog } = useUI()
  const onOpenChange = (open: boolean) => {
    if (!open) closeDialog()
  }
  const defaults = dialog?.defaults

  return (
    <>
      <NewClientDialog open={dialog?.kind === "client"} onOpenChange={onOpenChange} />
      <TaskFormDialog open={dialog?.kind === "task"} onOpenChange={onOpenChange} defaults={defaults} />
      <NewAppointmentDialog open={dialog?.kind === "appointment"} onOpenChange={onOpenChange} defaults={defaults} />
      <NewDocumentDialog open={dialog?.kind === "document"} onOpenChange={onOpenChange} defaults={defaults} />
      <NewProcessDialog open={dialog?.kind === "process"} onOpenChange={onOpenChange} clientId={defaults?.clientId} />
    </>
  )
}
