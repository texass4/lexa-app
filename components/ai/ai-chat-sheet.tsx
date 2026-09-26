"use client"

import * as React from "react"
import { ArrowUp, RotateCcw } from "lucide-react"
import { cn } from "cn"
import { SideSheet } from "@/components/ui/side-sheet"
import { Button } from "@/components/ui/button"
import { CHAT_LIMITS, type AIStatus } from "@/lib/ai/types"
import { AIErrorNotice, AIMark, AIThinking, AIUnavailable, AIWarnings, isAIReady, type SourceHandler } from "./ai-blocks"
import { AIMarkdown } from "./ai-markdown"
import type { AIChat } from "./use-ai"

/**
 * Conversa com a LEXA IA num painel lateral (de baixo, no mobile). O estado da
 * conversa fica com quem abre o painel (`useAIChat`), então fechar e reabrir
 * não perde o histórico — e trocar de processo começa outra conversa.
 */
export function AIChatSheet({
  open,
  onOpenChange,
  chat,
  subtitle,
  quickPrompts,
  status,
  onOpenSource,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chat: AIChat
  subtitle: string
  quickPrompts: string[]
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
            <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p>
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
              placeholder={ready ? "Pergunte sobre os dados do LEXA…" : "LEXA IA indisponível"}
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
          <div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Pergunte sobre os dados registrados no LEXA. A LEXA IA diferencia fatos, inferências e informações ausentes, e cita as fontes.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submit(prompt)}
                  disabled={chat.pending}
                  className="rounded-[10px] border border-border bg-surface px-3 py-2 text-left text-[13px] text-foreground outline-none transition-colors hover:border-border-strong hover:bg-surface-muted/60 focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-[14px] rounded-br-[4px] bg-surface-muted px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
                {message.content}
              </p>
            </div>
          ) : (
            <div key={message.id} className="flex gap-3">
              <AIMark className="size-7 rounded-[8px] [&_svg]:size-3.5" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <AIMarkdown text={message.content} sources={message.sources ?? {}} onOpen={onOpenSource} />
                <AIWarnings warnings={message.warnings ?? []} />
              </div>
            </div>
          ),
        )}

        {chat.pending && <AIThinking label="LEXA IA está consultando os dados…" onCancel={chat.cancel} className="pl-10" />}
        {chat.error && <AIErrorNotice error={chat.error} onRetry={chat.retry} />}
        <div ref={endRef} className={cn(chat.messages.length ? "h-1" : "h-0")} />
      </div>
    </SideSheet>
  )
}
