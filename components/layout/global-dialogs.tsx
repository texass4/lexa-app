"use client"

import { DIALOG_PERMISSION, useUI, type DialogKind } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"
import { NewClientDialog } from "@/components/clientes/new-client-dialog"
import { TaskFormDialog } from "@/components/tasks/task-form-dialog"
import { NewAppointmentDialog } from "@/components/agenda/new-appointment-dialog"
import { NewDocumentDialog } from "@/components/documentos/new-document-dialog"
import { NewProcessDialog } from "@/components/processos/new-process-dialog"
import { NewInvoiceDialog } from "@/components/financeiro/new-invoice-dialog"
import { DocumentPreviewSheet } from "@/components/shared/document-preview-sheet"

export function GlobalDialogs() {
  const { dialog, closeDialog } = useUI()
  const { can } = useSession()
  // Sem permissão, o diálogo não abre (a RLS barraria a gravação de qualquer forma).
  const isOpen = (kind: DialogKind) => dialog?.kind === kind && can(DIALOG_PERMISSION[kind])
  const onOpenChange = (open: boolean) => {
    if (!open) closeDialog()
  }
  const defaults = dialog?.defaults

  return (
    <>
      <NewClientDialog open={isOpen("client")} onOpenChange={onOpenChange} />
      <TaskFormDialog open={isOpen("task")} onOpenChange={onOpenChange} defaults={defaults} />
      <NewAppointmentDialog open={isOpen("appointment")} onOpenChange={onOpenChange} defaults={defaults} />
      <NewDocumentDialog open={isOpen("document")} onOpenChange={onOpenChange} defaults={defaults} />
      <NewProcessDialog open={isOpen("process")} onOpenChange={onOpenChange} clientId={defaults?.clientId} />
      <NewInvoiceDialog open={isOpen("invoice")} onOpenChange={onOpenChange} defaults={defaults} />
      <DocumentPreviewSheet documentId={defaults?.documentId} open={isOpen("document-preview")} onOpenChange={onOpenChange} />
    </>
  )
}
