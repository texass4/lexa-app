"use client"

import * as React from "react"
import { ArrowRight, ArrowUp, Check, Copy, ListChecks, Maximize2, MessagesSquare, Mic, Minimize2, RotateCcw, ShieldCheck, Square } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { SideSheet } from "@/components/ui/side-sheet"
import { UnderlineTabs } from "@/components/ui/underline-tabs"
import { ASSISTANT_WIDTH, useAssistantLayout } from "./assistant-layout"
import { AIPrivacyNote } from "./ai-privacy"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { CHAT_LIMITS, type AIStatus, type ChatMode } from "@/lib/ai/types"
import { useSession } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"
import { AIErrorNotice, AIMark, AIThinking, AIUnavailable, AIWarnings, isAIReady, type SourceHandler } from "./ai-blocks"
import { AIMarkdown } from "./ai-markdown"
import type { AIContext } from "./ai-context"
import type { AIChat, ChatEntry } from "./use-ai"
import { useLexaAI } from "./lexa-ai-provider"
import { useVoiceInput, type VoiceState } from "./use-voice-input"

const TOPIC = { office: "o escritório", process: "este processo", client: "este cliente", jurisprudence: "esta decisão" } as const

const CAPABILITIES = ["resumir", "explicar movimentações", "apontar o que merece atenção", "sugerir próximos passos"]

/** Modos da conversa, na ordem do seletor. */
const MODE_LABEL: Record<ChatMode, string> = { all: "All", office: "Escritório", jurisprudence: "Jurisprudência" }
const MODE_HINT: Record<ChatMode, string> = {
  all: "Dados do escritório e, quando a pergunta pede, a base de jurisprudência.",
  office: "Só os dados do escritório: tarefas, prazos, agenda, processos e clientes.",
  jurisprudence: "Só a base de jurisprudência: cada pergunta é pesquisada nas decisões.",
}

/** Sugestões do modo Jurisprudência (as do escopo falam de tarefas e prazos). */
function jurisprudencePrompts(scope: AIContext["scope"]["type"]) {
  return scope === "process"
    ? ["Há jurisprudência para este processo?", "Mostre a jurisprudência vinculada a este processo", "Quais decisões o escritório salvou?"]
    : [
        "Há jurisprudência sobre negativação indevida?",
        "Há jurisprudência sobre dano moral por atraso de voo?",
        "Quais decisões o escritório salvou?",
      ]
}

/** Seletor do modo da conversa (All, Escritório, Jurisprudência). */
function ModePicker({ modes, value, onChange }: { modes: ChatMode[]; value: ChatMode; onChange: (mode: ChatMode) => void }) {
  const labels = modes.map((mode) => MODE_LABEL[mode])
  return (
    <div className="space-y-1.5 px-5 py-2.5">
      <ChoiceChips
        ariaLabel="Responder com base em"
        options={labels}
        value={MODE_LABEL[value]}
        onChange={(label) => onChange(modes.find((mode) => MODE_LABEL[mode] === label) ?? "all")}
      />
      <p className="text-[11.5px] leading-snug text-subtle">{MODE_HINT[value]}</p>
    </div>
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
function VoiceStatus({ state, onCancel, onStop, onRetry }: { state: VoiceState; onCancel: () => void; onStop: () => void; onRetry: () => void }) {
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
            <Button type="button" variant="secondary" size="xs" onClick={onStop}>
              Concluir
            </Button>
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
  // Acoplado ao lado do conteúdo só quando sobra espaço para a página (`useAssistantLayout`).
  const { expanded, setExpanded, recent, open: openConversation } = useLexaAI()
  const layout = useAssistantLayout(expanded)
  const docked = layout.docked
  const endRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const ready = isAIReady(status)

  // Voz: a transcrição entra no campo (junto do que já foi digitado) para revisão — nunca é enviada sozinha.
  const voice = useVoiceInput({
    onTranscript: (text) => {
      setDraft((current) => {
        const next = current.trim() ? `${current.trimEnd()} ${text}` : text
        return next.slice(0, CHAT_LIMITS.messageChars)
      })
      requestAnimationFrame(() => {
        const input = inputRef.current
        if (!input) return
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      })
    },
  })
  const listening = voice.state.status === "requesting" || voice.state.status === "recording"
  const busyVoice = listening || voice.state.status === "processing"
  const { cancel: cancelVoice } = voice

  // Fechar a conversa nunca deixa o microfone ligado.
  React.useEffect(() => {
    if (!open) cancelVoice()
  }, [open, cancelVoice])

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [chat.messages.length, chat.pending])

  const submit = (text = draft) => {
    if (!text.trim() || chat.pending || !ready || busyVoice) return
    chat.send(text)
    setDraft("")
    voice.reset()
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
          <div className="flex items-center gap-3 px-5 pt-4 pb-2 pr-14">
            <AIMark />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] leading-tight font-semibold tracking-[-0.01em]">Assistente Íntegra</h2>
              <p className="truncate text-[12px] text-muted-foreground">{context.subtitle}</p>
            </div>
            {chat.messages.length > 0 && tab === "conversa" && (
              <Button variant="ghost" size="xs" onClick={chat.reset} aria-label="Começar nova conversa" title="Começar nova conversa">
                <RotateCcw /> Nova
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:hidden"
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
          {tab === "conversa" && (
            <p className="flex items-center gap-1.5 truncate px-5 py-2 text-[12px] text-muted-foreground">
              <span className={cn("size-1.5 shrink-0 rounded-full", ready ? "bg-success" : "bg-subtle")} aria-hidden />
              <span className="truncate">{ready ? `Responde com os dados de ${context.subtitle}` : "Íntegra IA indisponível no momento"}</span>
            </p>
          )}
          {tab === "conversa" && ready && onModeChange && modes && modes.length > 1 && (
            <ModePicker modes={modes} value={mode} onChange={onModeChange} />
          )}
        </div>
      }
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="space-y-2"
        >
          <VoiceStatus state={voice.state} onCancel={voice.cancel} onStop={voice.stop} onRetry={voice.start} />
          <div className="flex items-end gap-2 rounded-[12px] border border-border bg-surface px-3 py-2.5 shadow-xs focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/20">
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
                !ready
                  ? "Conversa indisponível"
                  : mode === "jurisprudence"
                    ? "Pesquise um tema na jurisprudência…"
                    : `Pergunte sobre ${TOPIC[context.scope.type]}…`
              }
              onChange={(e) => {
                setDraft(e.target.value)
                if (voice.state.status === "done") voice.reset()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[13.5px] pointer-coarse:min-h-8 leading-snug outline-none field-sizing-content placeholder:text-subtle disabled:cursor-not-allowed"
            />
            {ready && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={listening ? "Parar a gravação e transcrever" : "Falar a pergunta (gravar áudio)"}
                aria-pressed={listening}
                title={listening ? "Parar e transcrever" : "Falar a pergunta"}
                disabled={voice.state.status === "processing" || voice.state.status === "requesting"}
                onClick={() => (voice.state.status === "recording" ? voice.stop() : voice.start())}
                className={cn(
                  "text-muted-foreground",
                  listening && "bg-danger-soft text-danger hover:bg-danger-soft hover:text-danger",
                  voice.state.status === "processing" && "text-brand",
                )}
              >
                {voice.state.status === "recording" ? (
                  <Square className="fill-current" />
                ) : voice.state.status === "processing" ? (
                  <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
                ) : (
                  <Mic />
                )}
              </Button>
            )}
            <Button type="submit" size="icon-sm" aria-label="Enviar pergunta" disabled={!draft.trim() || chat.pending || !ready || busyVoice}>
              <ArrowUp />
            </Button>
          </div>
          <p className="text-[11.5px] text-subtle">A IA usa apenas os dados aos quais você tem acesso e pode errar. Confira antes de usar.</p>
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

          {chat.messages.length === 0 && ready && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              <p className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-foreground">
                {mode === "jurisprudence" ? "Pesquise na jurisprudência" : context.headline}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {mode === "jurisprudence" ? (
                  <>
                    Pergunte por um tema e a Íntegra pesquisa nas decisões da base de jurisprudência, citando cada decisão encontrada. Dados do
                    escritório não entram neste modo.
                  </>
                ) : (
                  <>
                    A partir do que está registrado sobre {TOPIC[context.scope.type]}, dá para {CAPABILITIES.slice(0, -1).join(", ")} e{" "}
                    {CAPABILITIES.at(-1)} — citando de onde veio cada informação. A resposta vira tarefa com um clique.
                  </>
                )}
              </p>
              <h3 className="mt-6 mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">
              Perguntas sugeridas para esta tela
            </h3>
              <div className="flex flex-col gap-2">
                {(mode === "jurisprudence" ? jurisprudencePrompts(context.scope.type) : context.prompts).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submit(prompt)}
                    disabled={chat.pending}
                    className="group flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-3 text-left text-[13px] leading-snug text-foreground outline-none transition-[border-color,background-color,transform] hover:border-brand/40 hover:bg-brand-soft/50 focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.99] disabled:opacity-50"
                  >
                    {prompt}
                    <ArrowRight className="size-3.5 shrink-0 text-subtle transition-colors group-hover:text-brand-strong" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {chat.messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <p className="max-w-[85%] rounded-[14px] rounded-br-[4px] bg-surface-muted px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
                  {message.content}
                </p>
              </div>
            ) : (
              <div key={message.id} className="flex gap-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                <AIMark className="size-7 rounded-[8px] [&_svg]:size-3.5" />
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
