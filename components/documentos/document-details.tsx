"use client"

import Link from "next/link"
import { Download, Eye, Link2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { FileIcon } from "@/components/shared/file-icon"
import { usePreview } from "@/components/shared/document-preview-sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { DocumentActions } from "@/components/shared/document-list"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { useUI } from "@/lib/store/ui-store"
import { copyDocumentLink, downloadDocument } from "@/lib/documentos/documents"
import { fmtLongDate, fmtTime } from "@/lib/core/dates"
import { formatFileSize } from "@/lib/core/format"
import { getUser } from "@/lib/auth/account"
import { processTitle } from "@/lib/processos/label"
import type { LegalDocument } from "@/types"

/**
 * Miniatura real quando há arquivo que o navegador exibe com segurança (imagem ou PDF);
 * senão, o ícone do tipo — e, se o arquivo não estiver no armazenamento, o aviso.
 */
function DetailsPreview({ doc }: { doc: LegalDocument }) {
  const preview = usePreview(doc)
  const visual = doc.extension === "pdf" || doc.extension === "jpg" || doc.extension === "png"
  if (!visual || preview.status === "missing" || (preview.status === "ready" && !preview.url)) {
    return (
      <>
        <FileIcon extension={doc.extension} className="h-16 w-12 text-[11px]" />
        {doc.storagePath && preview.status === "missing" && visual && (
          <p className="text-[11.5px] text-warning">Pré-visualização indisponível: arquivo não encontrado ou sem acesso.</p>
        )}
      </>
    )
  }
  if (preview.status === "loading") return <Skeleton className="h-[200px] w-full rounded-[8px]" />
  return doc.extension === "pdf" ? (
    <iframe
      title={`Pré-visualização de ${doc.name}`}
      src={`${preview.url}#toolbar=0&navpanes=0`}
      className="h-[240px] w-full rounded-[8px] border border-border bg-surface"
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={preview.url} alt={`Pré-visualização de ${doc.name}`} className="max-h-[240px] w-auto rounded-[8px] border border-border object-contain" />
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  )
}

/**
 * Detalhes do documento selecionado: o que está salvo no cadastro (tipo, tamanho, cliente,
 * processo, quem enviou e quando) e as ações que já existem — visualizar, baixar, copiar link,
 * editar e excluir.
 */
export function DocumentDetails({ doc, onClose }: { doc: LegalDocument; onClose: () => void }) {
  const data = useOfficeData()
  const { openDialog } = useUI()
  const client = byId(data.clients, doc.clientId)
  const process = byId(data.processes, doc.processId)
  const by = getUser(doc.uploadedById)
  const hasFile = !!doc.storagePath

  return (
    <aside aria-label={`Detalhes de ${doc.name}`} className="flex flex-col rounded-card border border-border bg-card shadow-card">
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 pt-1 text-[13px] font-semibold text-foreground">Detalhes</h2>
        <DocumentActions doc={doc} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes"
          className="flex size-8 shrink-0 items-center justify-center rounded-control text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="flex flex-col items-center gap-3 border-b border-border bg-surface-muted/40 px-4 py-5 text-center">
        <DetailsPreview doc={doc} />
        <p className="max-w-full text-[14px] leading-snug font-semibold break-words text-foreground">{doc.name}</p>
        <p className="text-[12px] text-muted-foreground">
          {doc.kind} · {doc.extension.toUpperCase()} · {formatFileSize(doc.sizeBytes)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3">
        <Button variant="secondary" size="sm" onClick={() => openDialog("document-preview", { documentId: doc.id })}>
          <Eye /> Visualizar
        </Button>
        <Button variant="secondary" size="sm" onClick={() => downloadDocument(doc)} disabled={!hasFile}>
          <Download /> Baixar
        </Button>
        {hasFile && (
          <Button variant="ghost" size="sm" className="col-span-2" onClick={() => copyDocumentLink(doc)}>
            <Link2 /> Copiar link (7 dias)
          </Button>
        )}
      </div>
      <dl className="divide-y divide-border/70 px-4 py-1">
        <Row label="Cliente">
          {client ? (
            <Link href={`/clientes/${client.id}?tab=documentos`} className="hover:underline">
              {client.name}
            </Link>
          ) : (
            <span className="text-subtle">Sem cliente</span>
          )}
        </Row>
        <Row label="Processo">
          {process ? (
            <Link href={`/processos/${process.id}`} className="block hover:underline">
              <span className="block">{processTitle(process)}</span>
              <span className="font-mono text-[11.5px] text-subtle">{process.code}</span>
            </Link>
          ) : (
            <span className="text-subtle">Sem processo</span>
          )}
        </Row>
        <Row label="Enviado por">
          <span className="flex items-center gap-2">
            <UserAvatar name={by.name} src={by.avatarUrl} size="xs" />
            <span className="truncate">{by.name}</span>
          </span>
        </Row>
        <Row label="Data">
          {fmtLongDate(doc.uploadedAt)}, {fmtTime(doc.uploadedAt)}
        </Row>
        <Row label="Arquivo">
          {hasFile ? "Salvo no armazenamento do escritório" : <span className="text-warning">Só o registro, sem arquivo enviado</span>}
        </Row>
      </dl>
    </aside>
  )
}
