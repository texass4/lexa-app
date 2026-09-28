"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Download, Ellipsis, ExternalLink, FolderInput, ImageOff, Pause, Play, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FileIcon } from "@/components/shared/file-icon"
import { Skeleton } from "@/components/ui/skeleton"
import { useDemoActions } from "@/lib/store/demo-store"
import { useSession } from "@/lib/auth/session"
import { getSupabase } from "@/lib/supabase/client"
import { formatFileSize, uid } from "@/lib/format"
import { attachmentUrl } from "@/lib/whatsapp/client"
import { extensionOf } from "@/lib/whatsapp/files"
import type { DocumentKind, LegalDocument, WhatsAppAttachment } from "@/types"
import { fmtDuration } from "./parts"

function useAttachmentUrl(attachment: WhatsAppAttachment) {
  const [url, setUrl] = React.useState<{ key: string; value: string | null }>()
  const key = `${attachment.id}:${attachment.storagePath ?? ""}:${attachment.remoteUrl ?? ""}`
  React.useEffect(() => {
    let cancelled = false
    attachmentUrl(attachment).then((value) => !cancelled && setUrl({ key, value }))
    return () => {
      cancelled = true
    }
    // `key` resume o que importa do anexo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return url?.key === key ? url.value : undefined
}

async function openAttachment(attachment: WhatsAppAttachment, download = false) {
  const url = await attachmentUrl(attachment, { download })
  if (!url) {
    toast("O arquivo ainda não está disponível.", { description: "Tente de novo em instantes." })
    return
  }
  if (download) window.location.assign(url)
  else window.open(url, "_blank", "noopener,noreferrer")
}

/* --------------------------- Salvar nos Documentos --------------------------- */

const KINDS: DocumentKind[] = ["Documento pessoal", "Comprovante", "Contrato", "Procuração", "Petição", "Laudo", "Decisão"]
const SAVABLE: Record<string, LegalDocument["extension"]> = { pdf: "pdf", docx: "docx", doc: "doc", txt: "txt", jpg: "jpg", jpeg: "jpg", png: "png" }
const MIME: Record<LegalDocument["extension"], string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  jpg: "image/jpeg",
  png: "image/png",
}

function useSaveToDocuments(attachment: WhatsAppAttachment, clientId?: string) {
  const { addDocument } = useDemoActions()
  const { can, organization } = useSession()
  const extension = SAVABLE[extensionOf(attachment.fileName, attachment.mimeType)]
  const available = !!clientId && !!extension && can("documents.edit")

  const save = async (kind: DocumentKind) => {
    if (!available) return
    const toastId = toast.loading("Salvando nos documentos do cliente…")
    try {
      const url = await attachmentUrl(attachment)
      if (!url) throw new Error("sem arquivo")
      const blob = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      if (blob.size > 25 * 1024 * 1024) throw new Error("O arquivo passa de 25 MB, o limite de Documentos.")
      const storagePath = `${organization.id}/${uid("file")}.${extension}`
      const { error } = await getSupabase().storage.from("documents").upload(storagePath, blob, { contentType: MIME[extension] })
      if (error) throw error
      const name = attachment.fileName ?? `WhatsApp ${new Date().toLocaleDateString("pt-BR")}.${extension}`
      addDocument({ name, kind, clientId, extension, sizeBytes: blob.size, storagePath })
      toast.success("Documento salvo no cadastro do cliente.", { id: toastId, description: name })
    } catch (error) {
      toast.error("Não foi possível salvar o documento.", { id: toastId, description: error instanceof Error && /25 MB/.test(error.message) ? error.message : undefined })
    }
  }
  return { available, save }
}

function AttachmentMenu({ attachment, clientId, tone }: { attachment: WhatsAppAttachment; clientId?: string; tone: "light" | "dark" }) {
  const saver = useSaveToDocuments(attachment, clientId)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Ações do arquivo"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-[7px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
          tone === "dark" ? "text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground" : "text-subtle hover:bg-accent hover:text-foreground",
        )}
      >
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-[10px] p-1">
        <DropdownMenuGroup>
          <DropdownMenuItem className="h-8 px-2" onClick={() => openAttachment(attachment)}>
            <ExternalLink /> Abrir
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => openAttachment(attachment, true)}>
            <Download /> Baixar
          </DropdownMenuItem>
          {saver.available && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="h-8 px-2">
                <FolderInput /> Salvar nos documentos
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48 rounded-[10px] p-1">
                {KINDS.map((kind) => (
                  <DropdownMenuItem key={kind} className="h-8 px-2" onClick={() => saver.save(kind)}>
                    {kind}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* --------------------------------- Imagem --------------------------------- */

function ImageAttachment({ attachment, clientId }: { attachment: WhatsAppAttachment; clientId?: string }) {
  const url = useAttachmentUrl(attachment)
  const [open, setOpen] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 4 / 3

  if (url === undefined) return <Skeleton className="h-48 w-64 max-w-full rounded-[10px]" />
  if (!url || failed)
    return (
      <div className="flex h-28 w-60 max-w-full flex-col items-center justify-center gap-1.5 rounded-[10px] bg-surface-muted/70 text-[12px] text-muted-foreground">
        <ImageOff className="size-5" />
        Imagem indisponível
      </div>
    )

  return (
    <>
      <div className="group/image relative">
        <button type="button" onClick={() => setOpen(true)} className="block overflow-hidden rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={attachment.fileName ?? "Imagem enviada na conversa"}
            onError={() => setFailed(true)}
            className="max-h-80 w-auto max-w-[min(320px,100%)] bg-surface-muted object-cover"
            style={{ aspectRatio: ratio }}
          />
        </button>
        <div className="absolute top-1.5 right-1.5 rounded-[8px] bg-black/35 opacity-0 backdrop-blur-sm transition-opacity group-hover/image:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <AttachmentMenu attachment={attachment} clientId={clientId} tone="dark" />
        </div>
      </div>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <DialogPrimitive.Popup className="fixed inset-0 z-50 flex items-center justify-center p-6 outline-none transition-[opacity,transform] duration-200 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
            <DialogPrimitive.Title className="sr-only">{attachment.fileName ?? "Imagem"}</DialogPrimitive.Title>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="max-h-full max-w-full rounded-[12px] object-contain shadow-float" />
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                type="button"
                onClick={() => openAttachment(attachment, true)}
                className="flex size-9 items-center justify-center rounded-[9px] bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-gold/50"
                aria-label="Baixar imagem"
              >
                <Download className="size-4" />
              </button>
              <DialogPrimitive.Close
                aria-label="Fechar"
                className="flex size-9 items-center justify-center rounded-[9px] bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}

/* ---------------------------------- Áudio --------------------------------- */

function AudioAttachment({ attachment, tone }: { attachment: WhatsAppAttachment; tone: "light" | "dark" }) {
  const url = useAttachmentUrl(attachment)
  const audio = React.useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [duration, setDuration] = React.useState(attachment.durationSeconds ?? 0)
  const dark = tone === "dark"

  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) el.play().catch(() => toast.error("Não foi possível tocar o áudio."))
    else el.pause()
  }

  return (
    <div className="flex w-[260px] max-w-full items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50",
          dark ? "bg-primary-foreground text-primary" : "bg-foreground text-background",
        )}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onClick={(e) => {
            const el = audio.current
            if (!el || !el.duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            el.currentTime = ((e.clientX - rect.left) / rect.width) * el.duration
          }}
          className={cn("relative h-1.5 cursor-pointer rounded-full", dark ? "bg-primary-foreground/25" : "bg-border-strong/70")}
        >
          <span className={cn("absolute inset-y-0 left-0 rounded-full", dark ? "bg-primary-foreground" : "bg-gold")} style={{ width: `${progress * 100}%` }} />
        </div>
        <p className={cn("tabular mt-1 text-[11px]", dark ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {attachment.voiceNote ? "Mensagem de voz" : (attachment.fileName ?? "Áudio")} · {fmtDuration(playing || progress ? progress * duration : duration)}
        </p>
      </div>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => e.currentTarget.duration && setProgress(e.currentTarget.currentTime / e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setProgress(0)
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------- Documento -------------------------------- */

function DocumentAttachment({ attachment, clientId, tone }: { attachment: WhatsAppAttachment; clientId?: string; tone: "light" | "dark" }) {
  const dark = tone === "dark"
  const ext = extensionOf(attachment.fileName, attachment.mimeType)
  const details = [
    ext.toUpperCase(),
    attachment.pageCount ? `${attachment.pageCount} ${attachment.pageCount === 1 ? "página" : "páginas"}` : null,
    attachment.sizeBytes ? formatFileSize(attachment.sizeBytes) : null,
  ].filter(Boolean)
  return (
    <div className={cn("flex w-[280px] max-w-full items-center gap-3 rounded-[10px] p-2", dark ? "bg-white/8" : "bg-surface-muted/70")}>
      <FileIcon extension={ext} />
      <button type="button" onClick={() => openAttachment(attachment)} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
        <p className={cn("truncate text-[13px] font-medium", dark ? "text-primary-foreground" : "text-foreground")}>{attachment.fileName ?? "Documento"}</p>
        <p className={cn("truncate text-[11.5px]", dark ? "text-primary-foreground/65" : "text-muted-foreground")}>{details.join(" · ")}</p>
      </button>
      <AttachmentMenu attachment={attachment} clientId={clientId} tone={tone} />
    </div>
  )
}

function VideoAttachment({ attachment }: { attachment: WhatsAppAttachment }) {
  const url = useAttachmentUrl(attachment)
  if (url === undefined) return <Skeleton className="h-44 w-64 max-w-full rounded-[10px]" />
  if (!url) return <p className="text-[12.5px] opacity-70">Vídeo indisponível</p>
  return <video src={url} controls preload="metadata" className="max-h-80 w-[320px] max-w-full rounded-[10px] bg-black" />
}

function StickerAttachment({ attachment }: { attachment: WhatsAppAttachment }) {
  const url = useAttachmentUrl(attachment)
  if (!url) return <Skeleton className="size-28 rounded-[10px]" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Figurinha" className="size-32 object-contain" />
}

export function AttachmentView({ attachment, clientId, tone }: { attachment: WhatsAppAttachment; clientId?: string; tone: "light" | "dark" }) {
  switch (attachment.kind) {
    case "image":
      return <ImageAttachment attachment={attachment} clientId={clientId} />
    case "audio":
      return <AudioAttachment attachment={attachment} tone={tone} />
    case "video":
      return <VideoAttachment attachment={attachment} />
    case "sticker":
      return <StickerAttachment attachment={attachment} />
    default:
      return <DocumentAttachment attachment={attachment} clientId={clientId} tone={tone} />
  }
}
