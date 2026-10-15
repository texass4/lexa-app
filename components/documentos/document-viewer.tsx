"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileWarning, Info, Loader2, Maximize, ZoomIn, ZoomOut } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FileIcon } from "@/components/shared/file-icon"
import { useOfficeData } from "@/lib/store/office-store"
import { fmtNumericDate } from "@/lib/core/dates"
import { formatFileSize } from "@/lib/core/format"
import { documentUrl } from "@/lib/documentos/documents"
import { openPdf } from "@/lib/documentos/pdf"
import type { LegalDocument } from "@/types"
import { useDocumentsActions } from "./document-actions"
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs"

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
/** Texto acima disto não é carregado na tela (baixar abre no programa da pessoa). */
const TEXT_PREVIEW_MAX = 2 * 1024 * 1024
/** A URL assinada do visualizador vale 30 min (a leitura do PDF é por partes). */
const VIEWER_URL_SECONDS = 30 * 60

type Source = { status: "loading" } | { status: "missing" } | { status: "ready"; url: string }

function useSignedUrl(doc: LegalDocument | undefined): Source {
  const [loaded, setLoaded] = React.useState<{ key: string; source: Source }>()
  const key = doc ? `${doc.id}:${doc.storagePath ?? ""}` : ""
  React.useEffect(() => {
    if (!doc?.storagePath) return
    let alive = true
    documentUrl(doc, { expiresIn: VIEWER_URL_SECONDS }).then(
      (url) => alive && setLoaded({ key, source: url ? { status: "ready", url } : { status: "missing" } }),
    )
    return () => {
      alive = false
    }
  }, [doc, key])
  if (!doc?.storagePath) return { status: "missing" }
  return loaded?.key === key ? loaded.source : { status: "loading" }
}

function Message({ title, description, doc }: { title: string; description: string; doc: LegalDocument }) {
  const a = useDocumentsActions()
  return (
    <div className="m-auto flex max-w-[380px] flex-col items-center px-6 text-center text-white/85">
      <span className="flex size-14 items-center justify-center rounded-full bg-white/10">
        <FileWarning className="size-6" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-white">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{description}</p>
      {doc.storagePath && (
        <Button className="mt-5" onClick={() => a.download([doc])}>
          <Download /> Baixar arquivo
        </Button>
      )}
    </div>
  )
}

/** PDF desenhado pelo pdf.js: uma página por vez, ajustada à largura, com zoom. */
function PdfView({
  url,
  zoom,
  page,
  onPages,
  onFail,
}: {
  url: string
  zoom: number
  page: number
  onPages: (n: number) => void
  onFail: () => void
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = React.useState<PDFDocumentProxy>()
  const [rendering, setRendering] = React.useState(true)
  const [width, setWidth] = React.useState(0)
  const callbacks = React.useRef({ onPages, onFail })
  React.useEffect(() => {
    callbacks.current = { onPages, onFail }
  })

  React.useEffect(() => {
    let alive = true
    let destroy: (() => void) | undefined
    openPdf(url)
      .then(({ task, pdf }) => {
        destroy = () => void task.destroy()
        if (!alive) return destroy()
        return pdf.then((doc) => {
          if (!alive) return
          setPdf(doc)
          callbacks.current.onPages(doc.numPages)
        })
      })
      .catch(() => alive && callbacks.current.onFail())
    return () => {
      alive = false
      destroy?.()
    }
  }, [url])

  React.useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => {
    if (!pdf || !width) return
    let task: RenderTask | undefined
    let alive = true
    pdf
      .getPage(page)
      .then((p) => {
        if (!alive) return
        const base = p.getViewport({ scale: 1 })
        const fit = Math.min((width - 32) / base.width, 2)
        const viewport = p.getViewport({ scale: fit * zoom })
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = canvasRef.current!
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        setRendering(true)
        task = p.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
        return task.promise.then(() => alive && setRendering(false))
      })
      .catch((error: { name?: string }) => {
        if (error?.name !== "RenderingCancelledException" && alive) callbacks.current.onFail()
      })
    return () => {
      alive = false
      task?.cancel()
    }
  }, [pdf, page, zoom, width])

  return (
    <div ref={boxRef} className="relative flex min-h-full w-full justify-center p-4">
      <canvas
        ref={canvasRef}
        className={cn(
          "h-auto max-w-none rounded-[4px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-opacity duration-150",
          !pdf && "opacity-0",
        )}
        aria-label="Página do documento"
        role="img"
      />
      {(!pdf || rendering) && (
        <Loader2
          className="absolute top-1/3 left-1/2 size-6 -translate-x-1/2 animate-spin text-white/70 motion-reduce:animate-none"
          aria-label="Carregando"
        />
      )}
    </div>
  )
}

function TextView({ url, doc }: { url: string; doc: LegalDocument }) {
  const [text, setText] = React.useState<{ url: string; value: string | null }>()
  React.useEffect(() => {
    let alive = true
    fetch(url)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
      .then((value) => alive && setText({ url, value }))
    return () => {
      alive = false
    }
  }, [url])
  if (text?.url !== url) return <Loader2 className="m-auto size-6 animate-spin text-white/70 motion-reduce:animate-none" aria-label="Carregando" />
  if (text.value === null)
    return <Message doc={doc} title="Não foi possível abrir o texto." description="O arquivo não respondeu. Tente de novo ou baixe para abrir." />
  return (
    <pre className="mx-auto my-4 w-full max-w-[860px] rounded-[8px] bg-white px-6 py-5 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-[#1f2937] shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      {text.value}
    </pre>
  )
}

/**
 * Visualizador da Central de Documentos: o arquivo na própria tela, com zoom e páginas
 * (PDF), por uma URL assinada temporária — o arquivo nunca fica público. Fechar volta
 * exatamente para a lista, na mesma pasta, com a mesma seleção.
 */
export function DocumentViewer({ documentId, onClose, backLabel }: { documentId?: string; onClose: () => void; backLabel: string }) {
  const data = useOfficeData()
  const a = useDocumentsActions()
  const [shown, setShown] = React.useState<LegalDocument>()
  const live = documentId ? data.documents.find((d) => d.id === documentId) : undefined
  if (live && live !== shown) setShown(live)
  const doc = live ?? shown
  const source = useSignedUrl(live)
  const [view, setView] = React.useState({ id: "", zoom: 1, page: 1, pages: 0, fallback: false })
  const state = view.id === documentId ? view : { id: documentId ?? "", zoom: 1, page: 1, pages: 0, fallback: false }
  const set = (patch: Partial<typeof state>) => setView({ ...state, ...patch })
  const isPdf = doc?.extension === "pdf"
  const isImage = doc?.extension === "jpg" || doc?.extension === "png"
  const zoomable = (isPdf && !state.fallback) || isImage
  const zoomIndex = ZOOMS.indexOf(state.zoom)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isPdf || state.fallback) return
    if ((e.key === "ArrowRight" || e.key === "PageDown") && state.page < state.pages) set({ page: state.page + 1 })
    if ((e.key === "ArrowLeft" || e.key === "PageUp") && state.page > 1) set({ page: state.page - 1 })
  }

  let body: React.ReactNode = null
  if (doc) {
    if (source.status === "loading")
      body = <Loader2 className="m-auto size-6 animate-spin text-white/70 motion-reduce:animate-none" aria-label="Carregando" />
    else if (source.status === "missing")
      body = (
        <Message
          doc={doc}
          title={doc.storagePath ? "Não foi possível abrir o arquivo." : "Este documento não tem arquivo salvo."}
          description={
            doc.storagePath
              ? "O arquivo não foi encontrado ou você não tem acesso a ele."
              : "Existe só o registro (nome, categoria e vínculos), sem arquivo enviado."
          }
        />
      )
    else if (isPdf)
      body = state.fallback ? (
        <iframe title={`Visualização de ${doc.name}`} src={source.url} className="size-full flex-1 border-0 bg-white" />
      ) : (
        <PdfView url={source.url} zoom={state.zoom} page={state.page} onPages={(pages) => set({ pages })} onFail={() => set({ fallback: true })} />
      )
    else if (isImage)
      body = (
        <div className="flex min-h-full w-full items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source.url}
            alt={doc.name}
            style={{ width: state.zoom === 1 ? undefined : `${state.zoom * 100}%` }}
            className={cn(
              "rounded-[4px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.35)]",
              state.zoom === 1 ? "max-h-full max-w-full object-contain" : "max-w-none",
            )}
          />
        </div>
      )
    else if (doc.extension === "txt")
      body =
        doc.sizeBytes > TEXT_PREVIEW_MAX ? (
          <Message doc={doc} title="Texto grande demais para a pré-visualização." description="Baixe o arquivo para abrir no seu editor." />
        ) : (
          <TextView url={source.url} doc={doc} />
        )
    else
      body = (
        <Message
          doc={doc}
          title="Sem pré-visualização para este formato."
          description={`Arquivos .${doc.extension} (Word) não são exibidos no navegador com segurança. Baixe para abrir no seu editor.`}
        />
      )
  }

  const iconButton =
    "flex size-9 items-center justify-center rounded-[8px] text-white/80 outline-none transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-35"

  return (
    <DialogPrimitive.Root open={!!live} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#0d131c]/80 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogPrimitive.Popup
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-[#161d27]/96 outline-none transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
        >
          {doc && (
            <>
              <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-2 sm:px-3">
                <DialogPrimitive.Close
                  className={cn(iconButton, "gap-1.5 px-2 sm:w-auto")}
                  aria-label={`Voltar para ${backLabel}`}
                  title={`Voltar para ${backLabel}`}
                >
                  <ArrowLeft className="size-4" />
                  <span className="hidden max-w-[180px] truncate text-[12.5px] sm:inline">{backLabel}</span>
                </DialogPrimitive.Close>
                <span className="mx-1 hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
                <FileIcon extension={doc.extension} className="h-8 w-6 text-[7px]" />
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="truncate text-[13.5px] font-semibold text-white">{doc.name}</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="truncate text-[11.5px] text-white/60">
                    {doc.kind} · {formatFileSize(doc.sizeBytes)} · {fmtNumericDate(doc.uploadedAt)}
                  </DialogPrimitive.Description>
                </div>
                {doc.storagePath && (
                  <button type="button" className={iconButton} onClick={() => a.download([doc])} aria-label="Baixar" title="Baixar">
                    <Download className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  className={iconButton}
                  onClick={() => {
                    onClose()
                    a.details(doc)
                  }}
                  aria-label="Ver detalhes"
                  title="Ver detalhes"
                >
                  <Info className="size-4" />
                </button>
              </header>
              <div className="flex min-h-0 flex-1 overflow-auto">{body}</div>
              {source.status === "ready" && zoomable && (
                <footer className="flex shrink-0 items-center justify-center gap-1 border-t border-white/10 px-3 py-2 pb-[max(env(safe-area-inset-bottom),8px)]">
                  {isPdf && (
                    <>
                      <button
                        type="button"
                        className={iconButton}
                        disabled={state.page <= 1}
                        onClick={() => set({ page: state.page - 1 })}
                        aria-label="Página anterior"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <span className="tabular min-w-[96px] text-center text-[12.5px] text-white/80" aria-live="polite">
                        {state.pages ? `Página ${state.page} de ${state.pages}` : "Carregando…"}
                      </span>
                      <button
                        type="button"
                        className={iconButton}
                        disabled={!state.pages || state.page >= state.pages}
                        onClick={() => set({ page: state.page + 1 })}
                        aria-label="Próxima página"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                      <span className="mx-2 h-5 w-px bg-white/15" aria-hidden />
                    </>
                  )}
                  <button
                    type="button"
                    className={iconButton}
                    disabled={zoomIndex <= 0}
                    onClick={() => set({ zoom: ZOOMS[zoomIndex - 1] })}
                    aria-label="Diminuir zoom"
                  >
                    <ZoomOut className="size-4" />
                  </button>
                  <span className="tabular min-w-[52px] text-center text-[12.5px] text-white/80">{Math.round(state.zoom * 100)}%</span>
                  <button
                    type="button"
                    className={iconButton}
                    disabled={zoomIndex >= ZOOMS.length - 1}
                    onClick={() => set({ zoom: ZOOMS[zoomIndex + 1] })}
                    aria-label="Aumentar zoom"
                  >
                    <ZoomIn className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={iconButton}
                    disabled={state.zoom === 1}
                    onClick={() => set({ zoom: 1 })}
                    aria-label="Ajustar à tela"
                    title="Ajustar à tela"
                  >
                    <Maximize className="size-4" />
                  </button>
                </footer>
              )}
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
