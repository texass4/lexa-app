"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Download, Ellipsis, Eye, Link2, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FileIcon } from "./file-icon"
import { EditDocumentDialog } from "@/components/documentos/edit-document-dialog"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { useUI } from "@/lib/store/ui-store"
import { copyDocumentLink, downloadDocument } from "@/lib/documentos/documents"
import { fmtNumericDate } from "@/lib/core/dates"
import { formatFileSize } from "@/lib/core/format"
import { getUser } from "@/lib/auth/account"
import type { Client, LegalDocument, Process } from "@/types"
import { Can } from "@/lib/auth/session"

export function DocumentActions({ doc }: { doc: LegalDocument }) {
  const { openDialog } = useUI()
  const { deleteDocument } = useOfficeActions()
  const [deleting, setDeleting] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Ações para ${doc.name}`}
          onClick={(e) => e.stopPropagation()}
          className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:bg-accent"
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 rounded-[10px] p-1" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem className="h-8 px-2" onClick={() => openDialog("document-preview", { documentId: doc.id })}>
              <Eye /> Visualizar
            </DropdownMenuItem>
            <DropdownMenuItem className="h-8 px-2" onClick={() => downloadDocument(doc)}>
              <Download /> Baixar
            </DropdownMenuItem>
            {doc.storagePath && (
              <DropdownMenuItem className="h-8 px-2" onClick={() => copyDocumentLink(doc)}>
                <Link2 /> Copiar link (7 dias)
              </DropdownMenuItem>
            )}
            <Can permission="documents.edit">
              <DropdownMenuItem className="h-8 px-2" onClick={() => setEditing(true)}>
                <Pencil /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => setDeleting(true)}>
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </Can>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditDocumentDialog doc={editing ? doc : undefined} onOpenChange={(o) => !o && setEditing(false)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir "${doc.name}"?`}
        description="Esta ação não pode ser desfeita."
        onConfirm={() => {
          deleteDocument(doc.id)
          toast.success("Documento excluído.", { description: doc.name })
        }}
      />
    </>
  )
}

/** Lista compacta de documentos (perfil do cliente e do processo). */
export function DocumentList({ documents, showClient = false }: { documents: LegalDocument[]; showClient?: boolean }) {
  const data = useOfficeData()
  // Listas longas (Documentos tem milhares): sem animação de posição, que mede cada linha a cada mudança.
  const animate = documents.length <= SMALL_LIST
  return (
    <ul className="divide-y divide-border">
      <AnimatePresence initial={false}>
        {documents.map((d) => (
          <DocumentItem
            key={d.id}
            doc={d}
            client={showClient ? byId(data.clients, d.clientId) : undefined}
            process={byId(data.processes, d.processId)}
            animate={animate}
          />
        ))}
      </AnimatePresence>
    </ul>
  )
}

/** Abaixo disso a lista anima entradas e reordenações. */
const SMALL_LIST = 50

/** Uma linha: só redesenha quando o próprio documento (ou seu cliente/processo) muda. */
const DocumentItem = React.memo(function DocumentItem({
  doc: d,
  client,
  process,
  animate,
}: {
  doc: LegalDocument
  client?: Client
  process?: Process
  animate: boolean
}) {
  const { openDialog } = useUI()
  return (
    <motion.li
      layout={animate}
      initial={{ opacity: 0, backgroundColor: "rgba(168,134,85,0.12)" }}
      animate={{ opacity: 1, backgroundColor: "rgba(168,134,85,0)" }}
      transition={{ duration: 0.3, backgroundColor: { duration: 1.6 } }}
      // O nome do arquivo ocupa a linha inteira como área de toque (abre o documento);
      // cliente, processo e "…" ficam por cima, com área própria.
      className="relative flex items-center gap-3.5 px-4 py-3 sm:px-5"
    >
      <FileIcon extension={d.extension} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => openDialog("document-preview", { documentId: d.id })}
          className="block max-w-full text-left text-[13.5px] font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline"
        >
          {/* O corte fica no texto: no botão, cortaria também a área que cobre a linha. */}
          <span className="block truncate">{d.name}</span>
        </button>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
          <span>{d.kind}</span>
          {client && (
            <>
              <span className="text-subtle">·</span>
              <Link href={`/clientes/${client.id}`} className="relative -my-[7px] py-[7px] hover:text-foreground hover:underline">
                {client.name}
              </Link>
            </>
          )}
          {process && (
            <>
              <span className="text-subtle">·</span>
              <Link href={`/processos/${process.id}`} className="relative -my-[7px] py-[7px] hover:text-foreground hover:underline">
                {process.code}
              </Link>
            </>
          )}
          <span className="text-subtle sm:hidden">·</span>
          <span className="tabular sm:hidden">{fmtNumericDate(d.uploadedAt)}</span>
        </p>
      </div>
      <div className="hidden w-28 shrink-0 text-right sm:block">
        <p className="tabular text-[12.5px] text-foreground">{fmtNumericDate(d.uploadedAt)}</p>
        <p className="text-[11.5px] text-subtle">por {getUser(d.uploadedById).firstName}</p>
      </div>
      <span className="tabular hidden w-16 shrink-0 text-right text-[12px] text-muted-foreground md:block">{formatFileSize(d.sizeBytes)}</span>
      <DocumentActions doc={d} />
    </motion.li>
  )
})
