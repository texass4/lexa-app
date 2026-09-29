"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { DIALOG_PERMISSION, useUI, type DialogKind } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"

// Os diálogos não fazem parte da primeira tela: saem do pacote inicial, são baixados
// quando o navegador fica ocioso e só montam na primeira abertura. Depois ficam
// montados, para a animação de fechar funcionar.
const loaders = {
  client: () => import("@/components/clientes/new-client-dialog"),
  task: () => import("@/components/tasks/task-form-dialog"),
  prazo: () => import("@/components/prazos/new-prazo-dialog"),
  appointment: () => import("@/components/agenda/new-appointment-dialog"),
  document: () => import("@/components/documentos/new-document-dialog"),
  process: () => import("@/components/processos/new-process-dialog"),
  invoice: () => import("@/components/financeiro/new-invoice-dialog"),
  preview: () => import("@/components/shared/document-preview-sheet"),
}
const NewClientDialog = dynamic(() => loaders.client().then((m) => m.NewClientDialog))
const TaskFormDialog = dynamic(() => loaders.task().then((m) => m.TaskFormDialog))
const NewPrazoDialog = dynamic(() => loaders.prazo().then((m) => m.NewPrazoDialog))
const NewAppointmentDialog = dynamic(() => loaders.appointment().then((m) => m.NewAppointmentDialog))
const NewDocumentDialog = dynamic(() => loaders.document().then((m) => m.NewDocumentDialog))
const NewProcessDialog = dynamic(() => loaders.process().then((m) => m.NewProcessDialog))
const NewInvoiceDialog = dynamic(() => loaders.invoice().then((m) => m.NewInvoiceDialog))
const DocumentPreviewSheet = dynamic(() => loaders.preview().then((m) => m.DocumentPreviewSheet))

/** Baixa os diálogos depois que a tela inicial terminou, para abrirem sem espera. */
function usePrefetchDialogs() {
  React.useEffect(() => {
    const prefetch = () => Object.values(loaders).forEach((load) => load().catch(() => {}))
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(prefetch, 2000)
    return () => clearTimeout(id)
  }, [])
}

export function GlobalDialogs() {
  const { dialog, closeDialog } = useUI()
  const { can } = useSession()
  usePrefetchDialogs()
  // Sem permissão, o diálogo não abre (a RLS barraria a gravação de qualquer forma).
  const isOpen = (kind: DialogKind) => dialog?.kind === kind && can(DIALOG_PERMISSION[kind])
  const onOpenChange = (open: boolean) => {
    if (!open) closeDialog()
  }
  const defaults = dialog?.defaults

  // Diálogos já abertos alguma vez nesta sessão.
  const [used, setUsed] = React.useState<ReadonlySet<DialogKind>>(() => new Set())
  const current = dialog && can(DIALOG_PERMISSION[dialog.kind]) ? dialog.kind : undefined
  if (current && !used.has(current)) setUsed(new Set(used).add(current))
  const mounted = (kind: DialogKind) => used.has(kind) || current === kind

  return (
    <>
      {mounted("client") && <NewClientDialog open={isOpen("client")} onOpenChange={onOpenChange} />}
      {mounted("task") && <TaskFormDialog open={isOpen("task")} onOpenChange={onOpenChange} defaults={defaults} />}
      {mounted("prazo") && <NewPrazoDialog open={isOpen("prazo")} onOpenChange={onOpenChange} defaults={defaults} />}
      {mounted("appointment") && <NewAppointmentDialog open={isOpen("appointment")} onOpenChange={onOpenChange} defaults={defaults} />}
      {mounted("document") && <NewDocumentDialog open={isOpen("document")} onOpenChange={onOpenChange} defaults={defaults} />}
      {mounted("process") && <NewProcessDialog open={isOpen("process")} onOpenChange={onOpenChange} clientId={defaults?.clientId} />}
      {mounted("invoice") && <NewInvoiceDialog open={isOpen("invoice")} onOpenChange={onOpenChange} defaults={defaults} />}
      {mounted("document-preview") && (
        <DocumentPreviewSheet documentId={defaults?.documentId} open={isOpen("document-preview")} onOpenChange={onOpenChange} />
      )}
    </>
  )
}
