"use client"

import * as React from "react"
import { ArrowUp, Check, Copy, ListChecks, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { SideSheet } from "@/components/ui/side-sheet"
import { Button } from "@/components/ui/button"
import { CHAT_LIMITS, type AIStatus } from "@/lib/ai/types"
import { useSession } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"
import { AIErrorNotice, AIMark, AIThinking, AIUnavailable, AIWarnings, isAIReady, type SourceHandler } from "./ai-blocks"
import { AIMarkdown } from "./ai-markdown"
import type { AIContext } from "./ai-context"
import type { AIChat, ChatEntry } from "./use-ai"
import { useLexaAI } from "./lexa-ai-provider"

const TOPIC = { office: "o escritório", process: "este processo", client: "este cliente" } as const

const CAPABILITIES = ["resumir", "explicar movimentações", "apontar o que merece atenção", "sugerir próximos passos"]

/** Ações sob cada resposta: a resposta vira trabalho (tarefa) ou texto reaproveitável. */
function AnswerActions({ entry, context }: { entry: ChatEntry; context: AIContext }) {
  const { openDialog } = useUI()
  const { can } = useSession()
  const { close } = useLexaAI()
  const [copied, setCopied] = React.useState(false)
  const scope = context.scope
  const canTask = can("tasks.edit") && scope.type !== "office"

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
              description: `${entry.content.slice(0, 1500)}\n\nOrigem: resposta da LEXA IA sobre ${context.subtitle}.`,
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

/**
 * Conversa com a LEXA IA num painel lateral (de baixo, no mobile). O estado da
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chat: AIChat
  context: AIContext
  status: AIStatus | null
  onOpenSource?: SourceHandler
}) {
  const [draft, setDraft] = React.useState("")
  const endRef = React.useRef<HTMLDivElement>(null)
  const ready = isAIReady(status)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [chat.messages.length, chat.pending])

  const submit = (text = draft) => {
    if (!text.trim() || chat.pending || !ready) return
    chat.send(text)
    setDraft("")
  }

  return (
    <SideSheet
      open={open}
      onOpenChange={onOpenChange}
      title="LEXA IA"
      className="sm:w-[520px]"
      header={
        <div className="flex items-center gap-3 border-b border-border px-5 py-4 pr-14">
          <AIMark />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">LEXA IA</h2>
            <p className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
              <span className="truncate">Contexto: {context.subtitle}</span>
            </p>
          </div>
          {chat.messages.length > 0 && (
            <Button variant="ghost" size="xs" onClick={chat.reset} aria-label="Começar nova conversa">
              <RotateCcw /> Nova conversa
            </Button>
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
          <div className="flex items-end gap-2 rounded-[12px] border border-border bg-surface px-3 py-2 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-gold/25">
            <label htmlFor="lexa-ai-input" className="sr-only">
              Pergunte à LEXA IA
            </label>
            <textarea
              id="lexa-ai-input"
              rows={1}
              value={draft}
              maxLength={CHAT_LIMITS.messageChars}
              disabled={!ready}
              placeholder={ready ? `Pergunte sobre ${TOPIC[context.scope.type]}…` : "LEXA IA indisponível"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-snug outline-none field-sizing-content placeholder:text-subtle disabled:cursor-not-allowed"
            />
            <Button type="submit" size="icon-sm" aria-label="Enviar pergunta" disabled={!draft.trim() || chat.pending || !ready}>
              <ArrowUp />
            </Button>
          </div>
          <p className="text-[11px] text-subtle">A LEXA IA responde só com os dados do LEXA e pode errar. Confira antes de usar.</p>
        </form>
      }
    >
      <div className="space-y-5 px-5 py-5">
        {status && !ready && <AIUnavailable status={status} />}

        {chat.messages.length === 0 && ready && (
          <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            <p className="font-serif text-[21px] leading-snug text-foreground">{context.headline}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              A LEXA lê os dados registrados sobre {TOPIC[context.scope.type]} e pode {CAPABILITIES.slice(0, -1).join(", ")} e {CAPABILITIES.at(-1)} —
              citando de onde tirou cada informação. Respostas viram tarefas com um clique.
            </p>
            <div className="mt-5 flex flex-col gap-1.5">
              {context.prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submit(prompt)}
                  disabled={chat.pending}
                  className="group flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-left text-[13px] text-foreground outline-none transition-[border-color,background-color,transform] hover:border-border-strong hover:bg-surface-muted/60 focus-visible:ring-2 focus-visible:ring-gold/40 active:scale-[0.99] disabled:opacity-50"
                >
                  {prompt}
                  <ArrowUp className="size-3.5 shrink-0 rotate-45 text-subtle transition-colors group-hover:text-gold-dark" />
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
            label={`LEXA está analisando ${context.scope.type === "office" ? "os dados do escritório" : context.subtitle}…`}
            onCancel={chat.cancel}
            className="pl-10"
          />
        )}
        {chat.error && <AIErrorNotice error={chat.error} onRetry={chat.retry} />}
        <div ref={endRef} className={cn(chat.messages.length ? "h-1" : "h-0")} />
      </div>
    </SideSheet>
  )
}
