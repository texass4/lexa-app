"use client"

import * as React from "react"
import {
  ArrowRight,
  Check,
  Copy,
  FileSearch,
  FileText,
  HelpCircle,
  ListChecks,
  Maximize2,
  MessagesSquare,
  Mic,
  Minimize2,
  Paperclip,
  RotateCcw,
  Scale,
  SendHorizontal,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  UserRound,
  X,
} from "lucide-react"
import Link from "next/link"
import { currentUserId, getUser } from "@/lib/auth/account"
import { formatFileSize } from "@/lib/core/format"
import { toast } from "sonner"
import { cn } from "cn"
import { SideSheet } from "@/components/ui/side-sheet"
import { UnderlineTabs } from "@/components/ui/underline-tabs"
import { ASSISTANT_WIDTH, useAssistantLayout } from "./assistant-layout"
import { AI_PRIVACY_HREF, AIPrivacyNote } from "./ai-privacy"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ATTACHMENT_ACCEPT, AttachmentError, readAttachment, type ReadAttachment } from "@/lib/ai/attachments"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { ATTACHMENT_LIMITS, CHAT_LIMITS, type AIStatus, type ChatMode } from "@/lib/ai/types"
import { useSession } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"
import { AIErrorNotice, AIThinking, AIUnavailable, AIWarnings, isAIReady, type SourceHandler } from "./ai-blocks"
import { AIMarkdown } from "./ai-markdown"
import type { AIContext } from "./ai-context"
import type { AIChat, ChatEntry } from "./use-ai"
import { useLexaAI } from "./lexa-ai-provider"
import { useVoiceInput, type VoiceState } from "./use-voice-input"

const TOPIC = { office: "o escritório", process: "este processo", client: "este cliente", jurisprudence: "esta decisão" } as const

const MODE_LABEL: Record<ChatMode, string> = { all: "All", office: "Escritório", jurisprudence: "Jurisprudência" }
const MODE_HINT: Record<ChatMode, string> = {
  all: "Dados do escritório e, quando a pergunta pede, a base de jurisprudência.",
  office: "Só os dados do escritório: tarefas, prazos, agenda, processos e clientes.",
  jurisprudence: "Só a base de jurisprudência: cada pergunta é pesquisada nas decisões.",
}

/** Atalho da tela inicial da conversa (formato de pílula, como no modelo). */
function StartChip({
  icon: Icon,
  disabled,
  onClick,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 items-center gap-2.5 rounded-full border border-border bg-surface px-4 text-[13px] font-medium text-foreground shadow-xs outline-none transition-[border-color,background-color] duration-150 hover:border-brand/40 hover:bg-brand-soft/50 focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-55"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      {children}
    </button>
  )
}

/** Marca do assistente: estrela de quatro pontas (a mesma do topo e da saudação). */
function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path
        d="M12 2c.6 4.9 1.8 7.9 3.6 9.4C17.1 12.7 19.6 13.7 22 14c-2.4.3-4.9 1.3-6.4 2.6C13.8 18.1 12.6 21.1 12 26c-.6-4.9-1.8-7.9-3.6-9.4C6.9 15.3 4.4 14.3 2 14c2.4-.3 4.9-1.3 6.4-2.6C10.2 9.9 11.4 6.9 12 2z"
        transform="translate(0 -2)"
      />
    </svg>
  )
}

/** Escolha do modo da conversa (All, Escritório, Jurisprudência), no ícone de ajustes do campo. */
function ModeMenu({ modes, value, onChange }: { modes: ChatMode[]; value: ChatMode; onChange: (mode: ChatMode) => void }) {
  const labels = modes.map((mode) => MODE_LABEL[mode])
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Responder com base em: ${MODE_LABEL[value]}`}
        title={`Base da resposta: ${MODE_LABEL[value]}`}
        className={cn(
          "flex size-8 items-center justify-center rounded-[8px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:bg-accent",
          value !== "all" && "text-brand",
        )}
      >
        <SlidersHorizontal className="size-[18px]" />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(320px,calc(100vw-2rem))] gap-2 p-3">
        <p className="text-[12px] font-semibold text-foreground">Responder com base em</p>
        <ChoiceChips
          ariaLabel="Responder com base em"
          options={labels}
          value={MODE_LABEL[value]}
          onChange={(label) => onChange(modes.find((mode) => MODE_LABEL[mode] === label) ?? "all")}
        />
        <p className="text-[11.5px] leading-snug text-muted-foreground">{MODE_HINT[value]}</p>
      </PopoverContent>
    </Popover>
  )
}

/** Ações sob cada resposta: a resposta vira trabalho (tarefa) ou texto reaproveitável. */
function AnswerActions({ entry, context }: { entry: ChatEntry; context: AIContext }) {
  const { openDialog } = useUI()
  const { can } = useSession()
  const { close } = useLexaAI()
  const [copied, setCopied] = React.useState(false)
  const scope = context.scope
  // Tarefa só nasce de conversa sobre processo ou cliente (decisão e escritório não têm vínculo).
  const canTask = can("tasks.edit") && (scope.type === "process" || scope.type === "client")

  return (
    <div className="flex flex-wrap items-center gap-1 pt-0.5">
      {canTask && (
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => {
            // Um diálogo por vez: fecha a conversa (que continua guardada) e abre o formulário.
            close()
            openDialog("task", {
              ...(scope.type === "process" ? { processId: scope.id } : { clientId: scope.id }),
              description: `${entry.content.slice(0, 1500)}\n\nOrigem: conversa sobre ${context.subtitle}.`,
            })
          }}
        >
          <ListChecks /> Criar tarefa
        </Button>
      )}
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        aria-label="Copiar resposta"
        onClick={() => {
          navigator.clipboard
            ?.writeText(entry.content)
            .then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            })
            .catch(() => toast.error("Não foi possível copiar a resposta."))
        }}
      >
        {copied ? <Check className="text-success" /> : <Copy />} {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  )
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

/** Linha de estado da gravação, logo acima do campo (anunciada aos leitores de tela). */
function VoiceStatus({ state, onCancel, onRetry }: { state: VoiceState; onCancel: () => void; onRetry: () => void }) {
  if (state.status === "idle") return null
  return (
    <div role="status" aria-live="polite" className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      {state.status === "requesting" && <span className="text-muted-foreground">Aguardando a permissão do microfone…</span>}
      {state.status === "recording" && (
        <>
          <span className="flex items-center gap-1.5 font-medium text-danger">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-danger" />
            Gravando · <span className="tabular">{clock(state.seconds)}</span>
            <span className="font-normal text-subtle">de 1:00</span>
          </span>
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
              Cancelar
            </Button>
            <span className="self-center text-subtle">Toque em enviar para transcrever</span>
          </span>
        </>
      )}
      {state.status === "processing" && (
        <>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-border-strong border-t-foreground" />
            Transcrevendo o áudio…
            {state.seconds >= 3 && (
              <span aria-hidden className="tabular text-subtle">
                {state.seconds} s
              </span>
            )}
          </span>
          <Button type="button" variant="ghost" size="xs" className="ml-auto" onClick={onCancel}>
            Cancelar
          </Button>
        </>
      )}
      {state.status === "done" && <span className="text-success">Transcrição inserida no campo — revise e envie quando quiser.</span>}
      {state.status === "error" && (
        <>
          <span className="min-w-0 flex-1 text-danger">{state.message}</span>
          {state.reason !== "unsupported" && (
            <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
              Tentar de novo
            </Button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Conversa com a Íntegra IA num painel lateral (de baixo, no mobile). O estado da
 * conversa fica no `LexaAIProvider` (`useAIChat`), então fechar e reabrir
 * não perde o histórico — e trocar de processo começa outra conversa.
 */
export function AIChatSheet({
  open,
  onOpenChange,
  chat,
  context,
  status,
  onOpenSource,
  mode = "all",
  modes,
  onModeChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chat: AIChat
  context: AIContext
  status: AIStatus | null
  onOpenSource?: SourceHandler
  /** Modo da conversa e os disponíveis para quem usa (sem eles, não há seletor). */
  mode?: ChatMode
  modes?: ChatMode[]
  onModeChange?: (mode: ChatMode) => void
}) {
  const [draft, setDraft] = React.useState("")
  const [tab, setTab] = React.useState<"conversa" | "contexto">("conversa")
  const [files, setFiles] = React.useState<ReadAttachment[]>([])
  const [reading, setReading] = React.useState(false)
  // Acoplado ao lado do conteúdo só quando sobra espaço para a página (`useAssistantLayout`).
  const { expanded, setExpanded, recent, open: openConversation } = useLexaAI()
  const layout = useAssistantLayout(expanded)
  const docked = layout.docked
  const endRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const ready = isAIReady(status)

  const focusInput = React.useCallback(() => {
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }, [])

  // Voz: "enviar" encerra a gravação, transcreve e manda a pergunta; o ícone do microfone
  // (durante a gravação) só transcreve para o campo, para revisar antes.
  const sendAfterVoice = React.useRef(false)
  const submitRef = React.useRef<(text?: string) => void>(() => {})
  const voice = useVoiceInput({
    onTranscript: (text) => {
      const combined = (draftRef.current.trim() ? `${draftRef.current.trimEnd()} ${text}` : text).slice(0, CHAT_LIMITS.messageChars)
      if (sendAfterVoice.current) {
        sendAfterVoice.current = false
        submitRef.current(combined)
        return
      }
      setDraft(combined)
      focusInput()
    },
  })
  const draftRef = React.useRef(draft)
  React.useEffect(() => {
    draftRef.current = draft
  }, [draft])
  const recording = voice.state.status === "recording"
  const listening = voice.state.status === "requesting" || recording
  const busyVoice = listening || voice.state.status === "processing"
  const { cancel: cancelVoice } = voice

  // Fechar a conversa nunca deixa o microfone ligado.
  React.useEffect(() => {
    if (!open) {
      sendAfterVoice.current = false
      cancelVoice()
    }
  }, [open, cancelVoice])

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [chat.messages.length, chat.pending])

  const scopeName = TOPIC[context.scope.type]
  const hasJurisprudenceMode = !!modes?.includes("jurisprudence") && !!onModeChange

  const addFiles = async (list: FileList | File[]) => {
    const incoming = Array.from(list)
    if (!incoming.length) return
    const room = ATTACHMENT_LIMITS.files - files.length
    if (room <= 0) return void toast.error(`Até ${ATTACHMENT_LIMITS.files} anexos por pergunta.`)
    setReading(true)
    const added: ReadAttachment[] = []
    for (const file of incoming.slice(0, room)) {
      try {
        const read = await readAttachment(file)
        if (files.some((f) => f.id === read.id) || added.some((f) => f.id === read.id)) continue
        added.push(read)
        if (read.truncated) toast(`“${read.name}” é longo: a Íntegra lê só o começo (${ATTACHMENT_LIMITS.chars.toLocaleString("pt-BR")} caracteres).`)
      } catch (error) {
        toast.error(error instanceof AttachmentError ? error.message : "Não foi possível ler o arquivo.")
      }
    }
    if (incoming.length > room) toast(`Só ${ATTACHMENT_LIMITS.files} anexos por pergunta: os demais foram ignorados.`)
    setFiles((current) => [...current, ...added])
    setReading(false)
    if (added.length) focusInput()
  }

  const canSend = ready && !chat.pending && !reading && (recording || (!busyVoice && (draft.trim().length > 0 || files.length > 0)))

  const submit = (text = draft) => {
    if (chat.pending || !ready || reading) return
    // Só anexos, sem pergunta: pede a leitura dos arquivos.
    const question = text.trim() || (files.length ? "Analise o documento anexado e resuma os pontos de atenção." : "")
    if (!question) return
    chat.send(
      question,
      files.map(({ name, text: body }) => ({ name, text: body })),
    )
    setDraft("")
    setFiles([])
    voice.reset()
  }
  React.useEffect(() => {
    submitRef.current = submit
  })

  const onSubmit = () => {
    if (recording) {
      sendAfterVoice.current = true
      voice.stop()
      return
    }
    submit()
  }

  return (
    <SideSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Assistente Íntegra"
      className={expanded ? "sm:w-[min(560px,calc(100vw-1rem))]" : "sm:w-[480px]"}
      docked={docked}
      dockedWidth={layout.width}
      header={
        <div className="border-b border-border">
          <div className="flex items-center gap-2.5 px-5 pt-4 pr-14 pb-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-soft text-brand ring-1 ring-brand/15"
            >
              <Spark className="size-[18px]" />
            </span>
            <h2 className="min-w-0 truncate text-[17px] leading-tight font-semibold tracking-[-0.015em] text-foreground">Assistente Íntegra</h2>
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-brand-strong">BETA</span>
            <span className="flex-1" />
            {chat.messages.length > 0 && tab === "conversa" && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={chat.reset}
                aria-label="Começar nova conversa"
                title="Nova conversa"
              >
                <RotateCcw />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground max-sm:hidden"
              onClick={() => setExpanded(!expanded)}
              aria-pressed={expanded}
              aria-label={expanded ? "Reduzir o painel" : "Expandir o painel"}
              title={expanded ? `Reduzir (${ASSISTANT_WIDTH.normal} px)` : `Expandir (${ASSISTANT_WIDTH.expanded} px)`}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
          <UnderlineTabs
            ariaLabel="Assistente"
            layoutId="assistant-tab"
            className="mx-0 px-5 sm:px-5"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "conversa", label: "Conversa" },
              { value: "contexto", label: "Contexto" },
            ]}
          />
        </div>
      }
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="space-y-2.5"
        >
          <VoiceStatus state={voice.state} onCancel={voice.cancel} onRetry={voice.start} />
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept={ATTACHMENT_ACCEPT}
            onChange={(e) => {
              void addFiles(e.target.files ?? [])
              e.target.value = ""
            }}
          />
          <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface px-3.5 pt-3 pb-2.5 shadow-xs focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/20">
            {(files.length > 0 || reading) && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Arquivos anexados">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex max-w-full items-center gap-1.5 rounded-[8px] border border-border bg-surface-muted/70 py-1 pr-1 pl-2 text-[12px]"
                  >
                    <FileText className="size-3.5 shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0 truncate" title={f.name}>
                      {f.name}
                    </span>
                    <span className="shrink-0 text-subtle">{formatFileSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((x) => x.id !== f.id))}
                      aria-label={`Remover o anexo ${f.name}`}
                      className="flex size-5 shrink-0 items-center justify-center rounded-md text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
                {reading && (
                  <li className="flex items-center gap-1.5 px-1 text-[12px] text-muted-foreground" role="status">
                    <span
                      aria-hidden
                      className="size-3 animate-spin rounded-full border-2 border-border-strong border-t-brand motion-reduce:animate-none"
                    />
                    Lendo o arquivo…
                  </li>
                )}
              </ul>
            )}
            <label htmlFor="lexa-ai-input" className="sr-only">
              Pergunte à Íntegra
            </label>
            <textarea
              id="lexa-ai-input"
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={CHAT_LIMITS.messageChars}
              disabled={!ready}
              placeholder={
                !ready ? "Conversa indisponível" : mode === "jurisprudence" ? "Pesquise um tema na jurisprudência..." : "Digite sua pergunta..."
              }
              onChange={(e) => {
                setDraft(e.target.value)
                if (voice.state.status === "done") voice.reset()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  onSubmit()
                }
              }}
              className="max-h-32 min-h-[44px] w-full resize-none bg-transparent py-1 text-[13.5px] pointer-coarse:min-h-8 leading-snug outline-none field-sizing-content placeholder:text-subtle disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Anexar arquivo (PDF, TXT, CSV ou MD)"
                  title="Anexar arquivo"
                  disabled={!ready || reading || files.length >= ATTACHMENT_LIMITS.files || busyVoice}
                  onClick={() => fileRef.current?.click()}
                  className="text-muted-foreground"
                >
                  <Paperclip className="size-[18px]" />
                </Button>
                {ready && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={recording ? "Parar a gravação e colocar o texto no campo" : "Falar a pergunta (gravar áudio)"}
                    aria-pressed={listening}
                    title={recording ? "Parar e colocar o texto no campo" : "Falar a pergunta"}
                    disabled={voice.state.status === "processing" || voice.state.status === "requesting"}
                    onClick={() => (recording ? voice.stop() : voice.start())}
                    className={cn(
                      "text-muted-foreground",
                      listening && "bg-danger-soft text-danger hover:bg-danger-soft hover:text-danger",
                      voice.state.status === "processing" && "text-brand",
                    )}
                  >
                    {recording ? (
                      <Square className="fill-current" />
                    ) : voice.state.status === "processing" ? (
                      <span
                        aria-hidden
                        className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-brand motion-reduce:animate-none"
                      />
                    ) : (
                      <Mic className="size-[18px]" />
                    )}
                  </Button>
                )}
                {ready && modes && modes.length > 1 && onModeChange && <ModeMenu modes={modes} value={mode} onChange={onModeChange} />}
              </div>
              <button
                type="submit"
                aria-label={recording ? "Enviar: parar a gravação, transcrever e perguntar" : "Enviar pergunta"}
                title={recording ? "Enviar (transcreve o áudio)" : "Enviar"}
                disabled={!canSend}
                className="flex size-9 items-center justify-center rounded-[10px] bg-brand text-brand-foreground shadow-xs outline-none transition-colors duration-150 hover:bg-brand-strong focus-visible:ring-2 focus-visible:ring-brand/40 disabled:bg-brand-soft disabled:text-brand/50 disabled:shadow-none"
              >
                <SendHorizontal className="size-[18px]" />
              </button>
            </div>
          </div>
          <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted-foreground">
            <UserRound className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              A IA utiliza apenas os dados aos quais você tem acesso.
              <br />
              <Link href={AI_PRIVACY_HREF} className="font-medium text-brand-strong underline underline-offset-2 hover:text-brand">
                Saiba mais
              </Link>
            </span>
          </p>
        </form>
      }
    >
      {tab === "contexto" ? (
        <div className="space-y-5 px-5 py-5 text-[13px]">
          <section className="space-y-1.5">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Assunto desta conversa</h3>
            <p className="font-medium text-foreground">{context.subtitle}</p>
            <p className="text-muted-foreground">
              Cada tela tem a sua conversa: ao abrir outro processo ou cliente, a Íntegra começa outra, e esta continua guardada.
            </p>
          </section>
          <section className="space-y-1.5">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">O que a resposta usa</h3>
            <p className="text-foreground">{MODE_HINT[mode]}</p>
            <p className="text-muted-foreground">Toda informação vem com a referência de onde saiu; o que não está nos dados aparece como ausente.</p>
          </section>
          {recent.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Outras conversas desta sessão</h3>
              <ul className="divide-y divide-border/70 rounded-[10px] border border-border">
                {recent.map((ctx) => (
                  <li key={`${ctx.scope.type}:${ctx.subtitle}`}>
                    <button
                      type="button"
                      onClick={() => {
                        openConversation(ctx)
                        setTab("conversa")
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-brand/40"
                    >
                      <MessagesSquare className="size-4 shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{ctx.subtitle}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="space-y-2 rounded-[10px] border border-border bg-surface-muted/60 p-3">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <ShieldCheck className="size-4 text-success" /> Privacidade
            </p>
            <AIPrivacyNote />
          </section>
          <Button variant="secondary" size="sm" onClick={() => setTab("conversa")}>
            Voltar à conversa <ArrowRight />
          </Button>
        </div>
      ) : (
        <div className="space-y-5 px-5 py-5">
          {status && !ready && <AIUnavailable status={status} />}

          {chat.messages.length === 0 && (
            <div className="flex flex-col items-center pt-6 pb-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              {/* Saudação: quem é a assistente. */}
              <span
                aria-hidden
                className="flex size-[88px] items-center justify-center rounded-full bg-gradient-to-b from-brand-soft to-brand-soft/60 text-brand ring-1 ring-brand/10"
              >
                <span className="flex size-[58px] items-center justify-center rounded-full bg-surface shadow-[0_6px_18px_-6px_rgb(43_87_196/0.35)]">
                  <Spark className="size-8" />
                </span>
              </span>
              <p className="mt-6 text-[17px] font-semibold tracking-[-0.01em] text-foreground">Olá, {getUser(currentUserId()).firstName}!</p>
              <p className="mt-2.5 max-w-[34ch] text-center text-[13.5px] leading-relaxed text-muted-foreground">
                {mode === "jurisprudence"
                  ? "Pergunte por um tema e eu pesquiso nas decisões da base de jurisprudência, citando cada decisão encontrada."
                  : "Sou a IA da Íntegra. Posso te ajudar a analisar processos, comparar jurisprudências, revisar documentos e muito mais. É só me dizer como posso ajudar hoje."}
              </p>
              <div className="mt-6 flex flex-col items-start gap-2.5 self-center">
                <StartChip
                  icon={FileText}
                  disabled={chat.pending || !ready}
                  onClick={() => submit(`Faça um resumo de ${scopeName}: o que está registrado e o que merece atenção.`)}
                >
                  Resumo {context.scope.type === "process" ? "do processo" : context.scope.type === "client" ? "do cliente" : "do escritório"}
                </StartChip>
                <StartChip
                  icon={Scale}
                  disabled={chat.pending || !ready}
                  onClick={() => {
                    if (hasJurisprudenceMode) {
                      onModeChange?.("jurisprudence")
                      focusInput()
                    } else submit(`Há jurisprudência relacionada a ${scopeName}?`)
                  }}
                >
                  Buscar jurisprudência
                </StartChip>
                <StartChip icon={FileSearch} disabled={chat.pending || !ready} onClick={() => fileRef.current?.click()}>
                  Analisar documento
                </StartChip>
                <StartChip
                  icon={ListChecks}
                  disabled={chat.pending || !ready}
                  onClick={() => submit(`Compare as decisões de jurisprudência salvas com ${scopeName}.`)}
                >
                  Comparar precedentes
                </StartChip>
                <StartChip icon={HelpCircle} disabled={chat.pending || !ready} onClick={focusInput}>
                  Tirar dúvidas jurídicas
                </StartChip>
              </div>
            </div>
          )}

          {chat.messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <div className="flex max-w-[85%] flex-col items-end gap-1.5">
                  {message.attachments && message.attachments.length > 0 && (
                    <ul className="flex flex-wrap justify-end gap-1.5" aria-label="Arquivos anexados">
                      {message.attachments.map((name, i) => (
                        <li
                          key={`${name}-${i}`}
                          className="flex max-w-full items-center gap-1.5 rounded-[8px] border border-border bg-surface px-2 py-1 text-[12px] text-muted-foreground"
                        >
                          <FileText className="size-3.5 shrink-0 text-brand" aria-hidden />
                          <span className="truncate">{name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="rounded-[14px] rounded-br-[4px] bg-surface-muted px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
                    {message.content}
                  </p>
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex gap-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-brand-soft text-brand ring-1 ring-brand/15"
                >
                  <Spark className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <AIMarkdown text={message.content} sources={message.sources ?? {}} onOpen={onOpenSource} />
                  <AIWarnings warnings={message.warnings ?? []} />
                  <AnswerActions entry={message} context={context} />
                </div>
              </div>
            ),
          )}

          {chat.pending && (
            <AIThinking
              label={`Lendo ${context.scope.type === "office" ? "os dados do escritório" : context.subtitle}…`}
              onCancel={chat.cancel}
              className="pl-10"
            />
          )}
          {chat.error && <AIErrorNotice error={chat.error} onRetry={chat.retry} />}
          <div ref={endRef} className={cn(chat.messages.length ? "h-1" : "h-0")} />
        </div>
      )}
    </SideSheet>
  )
}
