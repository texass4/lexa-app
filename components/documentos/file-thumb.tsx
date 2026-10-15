"use client"

import * as React from "react"
import { Briefcase, Folder, UserRound } from "lucide-react"
import { cn } from "cn"
import { FileIcon } from "@/components/shared/file-icon"
import { documentUrl } from "@/lib/documentos/documents"
import { cachedPdfThumbnail, pdfThumbnail, THUMBNAIL_MAX_BYTES } from "@/lib/documentos/pdf"
import type { LegalDocument } from "@/types"

/** Começa a carregar só quando o item chega perto da área visível (uma vez). */
function useNearViewport<T extends Element>() {
  const ref = React.useRef<T>(null)
  const [near, setNear] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: "200px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return [ref, near] as const
}

const isImage = (d: LegalDocument) => d.extension === "jpg" || d.extension === "png"
const thumbKey = (d: LegalDocument) => `${d.id}:${d.storagePath}`

/**
 * Miniatura real do arquivo: a imagem (URL assinada temporária) ou a primeira página do
 * PDF. Sem arquivo salvo, formato sem prévia, arquivo grande demais ou falha: o ícone do
 * formato — nunca uma imagem que não seja do próprio arquivo.
 */
export function FileThumb({
  doc,
  className,
  iconClassName,
  width = 320,
}: {
  doc: LegalDocument
  className?: string
  iconClassName?: string
  width?: number
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>()
  const key = thumbKey(doc)
  const canPreview = !!doc.storagePath && (isImage(doc) || (doc.extension === "pdf" && doc.sizeBytes <= THUMBNAIL_MAX_BYTES))
  const [loaded, setLoaded] = React.useState<{ key: string; src: string | null }>()
  const cached = doc.extension === "pdf" ? cachedPdfThumbnail(key) : undefined

  React.useEffect(() => {
    if (!near || !canPreview || cached) return
    let alive = true
    const job = isImage(doc) ? documentUrl(doc) : pdfThumbnail(key, () => documentUrl(doc), width)
    job.then((src) => alive && setLoaded({ key, src })).catch(() => alive && setLoaded({ key, src: null }))
    return () => {
      alive = false
    }
  }, [near, canPreview, cached, doc, key, width])

  const src = cached ?? (loaded?.key === key ? loaded.src : undefined)
  return (
    <div ref={ref} className={cn("relative flex items-center justify-center overflow-hidden", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setLoaded({ key, src: null })}
          className={cn("size-full object-cover", doc.extension === "pdf" ? "object-top" : "object-center")}
        />
      ) : (
        <FileIcon extension={doc.extension} className={cn("h-14 w-11 text-[10px]", iconClassName)} />
      )}
    </div>
  )
}

/** Ícone de cliente ou processo navegável (distinto do ícone de arquivo). */
export function FolderGlyph({ type, className }: { type: "client" | "process"; className?: string }) {
  const Badge = type === "client" ? UserRound : Briefcase
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0 items-center justify-center text-brand/80", className)}>
      <Folder className="size-full fill-brand-soft" strokeWidth={1.5} />
      <Badge className="absolute bottom-[18%] left-1/2 size-[38%] -translate-x-1/2 text-brand" strokeWidth={2} />
    </span>
  )
}
