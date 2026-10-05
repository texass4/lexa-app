"use client"

import * as React from "react"
import { ArrowUp, ChevronRight, Sparkles, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { useSession } from "@/lib/auth/session"
import { AI_NAME, BRAND } from "@/lib/core/brand"
import { useLexaAI } from "./lexa-ai-provider"
import type { AIContext } from "./ai-context"

export interface DockPrompt {
  label: string
  icon: LucideIcon
}

/**
 * Assistente da Íntegra IA na coluna da direita (Painel, perfil do cliente). Não
 * analisa nada sozinho: as sugestões e o campo de mensagem abrem a conversa real
 * (`useLexaAI`) com a pergunta já enviada, no contexto da tela. O destaque é uma
 * leitura dos dados (contagens, sinais), não uma resposta da IA.
 */
export function AIDock({
  intro,
  prompts,
  highlight,
  context,
  className,
}: {
  /** Frase abaixo do "Olá": o que dá para perguntar aqui. */
  intro: string
  prompts: DockPrompt[]
  highlight?: React.ReactNode
  /** Contexto da conversa; sem ele, vale o da rota atual. */
  context?: AIContext
  className?: string
}) {
  const lexa = useLexaAI()
  const { user } = useSession()
  const [message, setMessage] = React.useState("")
  const status = lexa.ready
    ? { label: "Online", cls: "bg-success-soft text-success", dot: "bg-success" }
    : lexa.status
      ? { label: lexa.status.enabled ? "Indisponível" : "Desligada", cls: "bg-surface-muted text-muted-foreground", dot: "bg-subtle" }
      : null

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const text = message.trim()
    if (!text) return
    lexa.ask(text, context)
    setMessage("")
  }

  return (
    <section aria-label={AI_NAME} className={cn("@container flex flex-col overflow-hidden rounded-card border border-border/90 bg-card shadow-card", className)}>
      <header className="flex items-center gap-3 px-5 pt-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_rgb(15_36_70/0.6)]">
          <Sparkles className="size-5" strokeWidth={1.8} />
        </span>
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">{AI_NAME}</h2>
        {status && (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", status.cls)}>
            <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
            {status.label}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-4 thin-scrollbar">
        <p className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">Olá, {user.firstName}!</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{intro}</p>

        {/* Coluna estreita: uma sugestão por linha; ocupando a largura da página, duas. */}
        <ul className="mt-5 grid gap-2 @2xl:grid-cols-2">
          {prompts.map(({ label, icon: Icon }) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => lexa.ask(label, context)}
                className="group flex w-full items-center gap-3 rounded-[12px] border border-border/90 bg-surface px-3.5 py-3 text-left text-[13px] text-foreground outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-xs focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground group-hover:text-brand" strokeWidth={1.8} />
                <span className="min-w-0 flex-1">{label}</span>
                <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>

        {highlight && <div className="ai-surface mt-5 rounded-[14px] border border-border/70 p-4">{highlight}</div>}
      </div>

      <form onSubmit={send} className="border-t border-border/80 px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2 rounded-[14px] border border-border bg-surface py-1.5 pr-1.5 pl-4 shadow-xs transition-[border-color,box-shadow] focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/10">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite sua mensagem…"
            aria-label={`Perguntar à ${AI_NAME}`}
            className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-subtle"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            aria-label="Enviar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/45 disabled:opacity-35"
          >
            <ArrowUp className="size-4" strokeWidth={2.2} />
          </button>
        </div>
        <p className="mt-2 px-1 text-[11px] text-subtle">A {BRAND.name} pode cometer erros. Confira sempre as informações.</p>
      </form>
    </section>
  )
}
