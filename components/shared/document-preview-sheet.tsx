"use client"

import * as React from "react"
import { Download, FileWarning } from "lucide-react"
import { SideSheet } from "@/components/ui/side-sheet"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Eyebrow } from "@/components/ui/panel"
import { FileIcon } from "./file-icon"
import { useDemoData } from "@/lib/store/demo-store"
import { fmtNumericDate } from "@/lib/dates"
import { formatFileSize } from "@/lib/format"
import { getUser } from "@/lib/account"
import { documentUrl, downloadDocument } from "@/lib/documents"
import type { LegalDocument } from "@/types"

type Preview = { status: "loading" } | { status: "missing" } | { status: "ready"; url: string; text?: string }

const PREVIEWABLE = new Set<LegalDocument["extension"]>(["pdf", "jpg", "png", "txt"])

/** Busca uma URL temporária do arquivo (e o conteúdo, se for texto). */
function usePreview(doc: LegalDocument): Preview {
  const [loaded, setLoaded] = React.useState<{ key: string; preview: Preview }>()
  const key = `${doc.id}:${doc.storagePath ?? ""}`

  React.useEffect(() => {
    if (!doc.storagePath || !PREVIEWABLE.has(doc.extension)) return
    let cancelled = false
    ;(async () => {
      const url = await documentUrl(doc)
      let preview: Preview = url ? { status: "ready", url } : { status: "missing" }
      if (url && doc.extension === "txt") {
        const text = await fetch(url)
          .then((r) => (r.ok ? r.text() : null))
          .catch(() => null)
        preview = text === null ? { status: "missing" } : { status: "ready", url, text }
      }
      if (!cancelled) setLoaded({ key, preview })
    })()
    return () => {
      cancelled = true
    }
  }, [doc, key])

  if (!doc.storagePath) return { status: "missing" }
  if (!PREVIEWABLE.has(doc.extension)) return { status: "ready", url: "" }
  return loaded?.key === key ? loaded.preview : { status: "loading" }
}

function DownloadButton({ doc }: { doc: LegalDocument }) {
  return (
    <Button size="sm" onClick={() => downloadDocument(doc)}>
      <Download /> Baixar
    </Button>
  )
}

function PreviewBody({ doc }: { doc: LegalDocument }) {
  const preview = usePreview(doc)

  if (preview.status === "loading") return <Skeleton className="mx-5 h-[60vh]" />

  if (preview.status === "missing") {
    return (
      <EmptyState
        icon={<FileWarning />}
        title="Pré-visualização não disponível."
        description="Este documento não tem arquivo salvo ou você não tem acesso a ele."
        action={doc.storagePath ? <DownloadButton doc={doc} /> : undefined}
      />
    )
  }

  if (doc.extension === "pdf") return <iframe title={doc.name} src={preview.url} className="h-full min-h-[70vh] w-full border-0" />

  if (doc.extension === "jpg" || doc.extension === "png") {
    return (
      <div className="flex justify-center bg-surface-muted/40 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview.url} alt={doc.name} className="max-h-[70vh] rounded-[10px] object-contain shadow-card" />
      </div>
    )
  }

  if (doc.extension === "txt") {
    return (
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-5 py-4 text-[12.5px] leading-relaxed text-foreground">
        {preview.text}
      </pre>
    )
  }

  return (
    <EmptyState
      icon={<FileWarning />}
      title="Formato sem pré-visualização."
      description={`Arquivos .${doc.extension} não podem ser exibidos com segurança no navegador — baixe para abrir.`}
      action={<DownloadButton doc={doc} />}
    />
  )
}

export function DocumentPreviewSheet({ documentId, open, onOpenChange }: { documentId?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const data = useDemoData()
  const [shown, setShown] = React.useState<LegalDocument | undefined>()
  const doc = documentId ? data.documents.find((d) => d.id === documentId) : undefined
  if (doc && doc !== shown) setShown(doc)
  const d = doc ?? shown
  if (!d) return null

  const by = getUser(d.uploadedById)

  return (
    <SideSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Documento: ${d.name}`}
      className="sm:w-[640px]"
      header={
        <div className="flex items-start gap-3 border-b border-border px-5 pt-5 pb-4 pr-14">
          <FileIcon extension={d.extension} className="h-11 w-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug">{d.name}</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {d.kind} · {formatFileSize(d.sizeBytes)} · {fmtNumericDate(d.uploadedAt)} · por {by.firstName}
            </p>
          </div>
        </div>
      }
      footer={
        <Button variant="secondary" className="w-full sm:w-auto sm:ml-auto" onClick={() => downloadDocument(d)}>
          <Download /> Baixar
        </Button>
      }
    >
      <div className="py-2">
        <Eyebrow className="px-5 pt-3">Pré-visualização</Eyebrow>
        <div className="mt-2">
          <PreviewBody doc={d} />
        </div>
      </div>
    </SideSheet>
  )
}
