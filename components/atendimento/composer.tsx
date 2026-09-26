"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileText, ImageIcon, Lock, Mic, Music, Paperclip, Plus, Reply, SendHorizontal, Square, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FileIcon } from "@/components/shared/file-icon"
import { formatFileSize } from "@/lib/format"
import { attachmentKindFor, extensionOf } from "@/lib/whatsapp/files"
import { MAX_ATTACHMENT_BYTES, TYPE_PREVIEW } from "@/lib/whatsapp/config"
import type { WhatsAppMessage } from "@/types"
import { EmojiPicker } from "./emoji-picker"
import { useDraft } from "./drafts"
import { fmtDuration } from "./parts"

export interface ComposerSubmit {
  mode: "reply" | "note"
  text: string
  file?: File
  durationSeconds?: number
}

const RECORDER_TYPES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"]

function useRecorder() {
  const [state, setState] = React.useState<{ recording: boolean; seconds: number }>({ recording: false, seconds: 0 })
  const recorder = React.useRef<MediaRecorder | null>(null)
  const chunks = React.useRef<Blob[]>([])
  const timer = React.useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const started = React.useRef(0)

  const stopTracks = () => recorder.current?.stream.getTracks().forEach((t) => t.stop())

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador não grava áudio. Anexe um arquivo de áudio.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.start(250)
      recorder.current = rec
      started.current = Date.now()
      setState({ recording: true, seconds: 0 })
      timer.current = setInterval(() => setState({ recording: true, seconds: Math.floor((Date.now() - started.current) / 1000) }), 250)
    } catch {
      toast.error("Não foi possível usar o microfone.", { description: "Verifique a permissão do navegador." })
    }
  }

  const finish = (keep: boolean) =>
    new Promise<{ file: File; seconds: number } | null>((resolve) => {
      const rec = recorder.current
      clearInterval(timer.current)
      setState({ recording: false, seconds: 0 })
      if (!rec) return resolve(null)
      const seconds = (Date.now() - started.current) / 1000
      rec.onstop = () => {
        stopTracks()
        recorder.current = null
        if (!keep || !chunks.current.length) return resolve(null)
        const type = (rec.mimeType || "audio/webm").split(";")[0]
        const blob = new Blob(chunks.current, { type })
        resolve({ file: new File([blob], `audio-${Date.now()}.${extensionOf(undefined, type)}`, { type }), seconds })
      }
      rec.stop()
    })

  React.useEffect(
    () => () => {
      clearInterval(timer.current)
      stopTracks()
    },
    [],
  )

  return { ...state, start, finish }
}

export function Composer({
  conversationId,
  replyTo,
  onClearReply,
  onSubmit,
  canSend,
  canReply,
  replyDisabledReason,
  droppedFile,
  onDroppedFileHandled,
}: {
  conversationId: string
  replyTo?: WhatsAppMessage
  onClearReply: () => void
  onSubmit: (input: ComposerSubmit) => Promise<boolean>
  /** Tem `whatsapp.edit`. */
  canSend: boolean
  /** O WhatsApp está pronto para enviar (notas funcionam sempre). */
  canReply: boolean
  replyDisabledReason?: string
  droppedFile?: File
  onDroppedFileHandled: () => void
}) {
  const [draft, setDraft] = useDraft(conversationId)
  const [file, setFile] = React.useState<File>()
  const [preview, setPreview] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  const textarea = React.useRef<HTMLTextAreaElement>(null)
  const imageInput = React.useRef<HTMLInputElement>(null)
  const docInput = React.useRef<HTMLInputElement>(null)
  const audioInput = React.useRef<HTMLInputElement>(null)
  const recorder = useRecorder()
  const note = draft.mode === "note"
  const blocked = !canSend || (!note && !canReply)

  const attach = React.useCallback((f?: File | null) => {
    if (!f) return
    if (f.size > MAX_ATTACHMENT_BYTES) {
      toast.error("O arquivo passa de 64 MB.")
      return
    }
    setFile(f)
  }, [])

  // Arquivo solto sobre a conversa.
  React.useEffect(() => {
    if (!droppedFile) return
    if (note) toast("Notas internas não levam anexo.", { description: "Mude para Responder para enviar o arquivo." })
    // Reação a um evento externo (arrastar e soltar).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else attach(droppedFile)
    onDroppedFileHandled()
  }, [droppedFile, note, attach, onDroppedFileHandled])

  React.useEffect(() => {
    if (!file || attachmentKindFor(file.type) !== "image") return
    const url = URL.createObjectURL(file)
    // Pré-visualização local do arquivo escolhido (URL de objeto do navegador).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(url)
    return () => {
      URL.revokeObjectURL(url)
      setPreview(undefined)
    }
  }, [file])

  // Foca o campo ao abrir a conversa ou escolher responder.
  React.useEffect(() => {
    textarea.current?.focus()
  }, [conversationId, replyTo?.id])

  // Altura automática (até ~7 linhas).
  React.useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`
  }, [draft.text])

  const submit = async (override?: Partial<ComposerSubmit>) => {
    if (busy || blocked) return
    const text = draft.text.trim()
    const payload: ComposerSubmit = { mode: draft.mode, text, file: note ? undefined : file, ...override }
    if (!payload.text && !payload.file) return
    setBusy(true)
    const previous = { text: draft.text, file }
    setDraft({ text: "" })
    setFile(undefined)
    const ok = await onSubmit(payload)
    setBusy(false)
    if (!ok) {
      setDraft({ text: previous.text })
      setFile(previous.file)
    }
    textarea.current?.focus()
  }

  const insertEmoji = (emoji: string) => {
    const el = textarea.current
    const start = el?.selectionStart ?? draft.text.length
    const end = el?.selectionEnd ?? draft.text.length
    setDraft({ text: draft.text.slice(0, start) + emoji + draft.text.slice(end) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const stopRecording = async (keep: boolean) => {
    const result = await recorder.finish(keep)
    if (result) await submit({ mode: "reply", text: "", file: result.file, durationSeconds: result.seconds })
  }

  if (!canSend) {
    return (
      <div className="shrink-0 border-t border-border px-4 py-3.5 text-center text-[12.5px] text-muted-foreground">
        Você pode acompanhar esta conversa, mas não tem permissão para responder.
      </div>
    )
  }

  const kind = file ? attachmentKindFor(file.type) : undefined

  return (
    <div className={cn("shrink-0 border-t px-3 pt-2.5 pb-3 transition-colors sm:px-4", note ? "border-gold/25 bg-gold-soft/45" : "border-border bg-card")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Tipo de mensagem" className="inline-flex rounded-[9px] border border-border bg-surface-muted/60 p-[2px]">
          {(["reply", "note"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={draft.mode === mode}
              onClick={() => setDraft({ mode })}
              className={cn(
                "relative inline-flex h-6 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
                draft.mode === mode ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {draft.mode === mode && (
                <motion.span layoutId="composer-mode" transition={{ type: "spring", stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-[7px] border border-border bg-surface shadow-xs" />
              )}
              <span className="relative flex items-center gap-1.5">
                {mode === "note" && <Lock className="size-3" />}
                {mode === "reply" ? "Responder" : "Nota interna"}
              </span>
            </button>
          ))}
        </div>
        <span className={cn("text-[11.5px]", note ? "text-gold-dark" : "text-subtle")}>
          {note ? "Só a equipe vê. Nunca vai para o WhatsApp." : blocked ? replyDisabledReason : "Enter envia · Shift+Enter quebra a linha"}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {replyTo && !note && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-muted/60 py-1.5 pr-1.5 pl-2.5">
              <Reply className="size-3.5 shrink-0 text-gold" />
              <div className="min-w-0 flex-1 border-l-2 border-gold/60 pl-2">
                <p className="text-[11.5px] font-medium text-foreground">{replyTo.direction === "inbound" ? "Respondendo ao cliente" : "Respondendo à sua mensagem"}</p>
                <p className="truncate text-[12px] text-muted-foreground">{replyTo.body || TYPE_PREVIEW[replyTo.type]}</p>
              </div>
              <Button variant="ghost" size="icon-xs" aria-label="Cancelar resposta" onClick={onClearReply}>
                <X />
              </Button>
            </div>
          </motion.div>
        )}
        {file && !note && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
            <div className="mb-2 flex items-center gap-3 rounded-[12px] border border-border bg-surface p-2">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="size-12 rounded-[8px] object-cover" />
              ) : kind === "audio" ? (
                <span className="flex size-12 items-center justify-center rounded-[8px] bg-violet-soft text-violet">
                  <Music className="size-5" />
                </span>
              ) : (
                <FileIcon extension={extensionOf(file.name, file.type)} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{file.name}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {kind === "image" ? "Imagem" : kind === "audio" ? "Áudio" : "Documento"} · {formatFileSize(file.size)}
                  {kind !== "audio" && " · a mensagem vira a legenda"}
                </p>
              </div>
              <Button variant="ghost" size="icon-xs" aria-label="Remover anexo" onClick={() => setFile(undefined)}>
                <X />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {recorder.recording ? (
        <div className="flex items-center gap-2 rounded-[12px] border border-danger/20 bg-danger-soft/60 px-2 py-1.5">
          <Button variant="ghost" size="icon-sm" aria-label="Descartar gravação" onClick={() => stopRecording(false)}>
            <Trash2 />
          </Button>
          <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden />
          <span className="tabular flex-1 text-[13px] font-medium text-danger">Gravando · {fmtDuration(recorder.seconds)}</span>
          <Button size="sm" onClick={() => stopRecording(true)}>
            <Square className="size-3 fill-current" /> Parar e enviar
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-end gap-1 rounded-[14px] border bg-surface p-1 shadow-xs transition-[border-color,box-shadow] focus-within:ring-3",
            note ? "border-gold/35 focus-within:border-gold/60 focus-within:ring-gold/15" : "border-border focus-within:border-gold/50 focus-within:ring-gold/12",
          )}
        >
          {!note && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Anexar arquivo"
                disabled={blocked}
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-50 aria-expanded:bg-accent"
              >
                <Plus className="size-[18px]" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-48 rounded-[10px] p-1">
                <DropdownMenuGroup>
                  <DropdownMenuItem className="h-8 px-2" onClick={() => imageInput.current?.click()}>
                    <ImageIcon /> Imagem
                  </DropdownMenuItem>
                  <DropdownMenuItem className="h-8 px-2" onClick={() => docInput.current?.click()}>
                    <FileText /> Documento ou PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem className="h-8 px-2" onClick={() => audioInput.current?.click()}>
                    <Paperclip /> Arquivo de áudio
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <EmojiPicker onPick={insertEmoji} disabled={blocked} />
          <textarea
            ref={textarea}
            rows={1}
            value={draft.text}
            disabled={blocked}
            onChange={(e) => setDraft({ text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.files?.[0]
              if (pasted && !note) {
                e.preventDefault()
                attach(pasted)
              }
            }}
            placeholder={note ? "Escreva uma nota para a equipe…" : file ? "Adicione uma legenda…" : "Digite uma mensagem…"}
            aria-label={note ? "Nota interna" : "Mensagem"}
            className="max-h-44 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-[14px] leading-[20px] text-foreground outline-none placeholder:text-subtle disabled:opacity-60 sm:text-[13.5px]"
          />
          {!note && !draft.text.trim() && !file ? (
            <Button variant="ghost" size="icon" aria-label="Gravar áudio" disabled={blocked || busy} onClick={recorder.start} className="rounded-[10px]">
              <Mic className="size-[18px]" />
            </Button>
          ) : (
            <Button
              variant={note ? "gold" : "default"}
              onClick={() => submit()}
              disabled={blocked || busy || (!draft.text.trim() && !file)}
              className="h-9 rounded-[10px] px-3.5"
            >
              {note ? "Salvar nota" : "Enviar"}
              {!note && <SendHorizontal className="size-3.5" />}
            </Button>
          )}
        </div>
      )}

      <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => (attach(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={docInput} type="file" className="hidden" onChange={(e) => (attach(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={(e) => (attach(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  )
}
