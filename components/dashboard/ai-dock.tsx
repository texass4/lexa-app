"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, ArrowUp, ChevronRight, History, ListChecks, PauseCircle, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { OFFICE_PROMPTS } from "@/components/ai/ai-context"
import { useOfficeData } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import { officeDigest } from "@/lib/dashboard/dashboard"
import { AI_NAME, BRAND } from "@/lib/core/brand"

/** Ícone de cada pergunta sugerida (as perguntas vêm de `OFFICE_PROMPTS`). */
const PROMPT_ICONS: LucideIcon[] = [ShieldAlert, History, PauseCircle, ListChecks]

/**
 * Assistente fixo ao lado do Painel (telas largas). Tudo aqui usa a conversa real da
 * Íntegra IA (`useLexaAI`): as sugestões e o campo de mensagem abrem a conversa com a
 * pergunta já enviada. O destaque é uma contagem dos dados, não uma análise da IA.
 */
export function AIDock() {
  const lexa = useLexaAI()
  const data = useOfficeData()
  const { user } = useSession()
  const [message, setMessage] = React.useState("")
  const digest = officeDigest(data)
  const prompts = OFFICE_PROMPTS.slice(0, 4)
  const status = lexa.ready
    ? { label: "Online", cls: "bg-success-soft text-success", dot: "bg-success" }
    : lexa.status
      ? { label: lexa.status.enabled ? "Não configurada" : "Desligada", cls: "bg-surface-muted text-muted-foreground", dot: "bg-subtle" }
      : null

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const text = message.trim()
    if (!text) return
    lexa.ask(text)
    setMessage("")
  }

  return (
    <section aria-label={AI_NAME} className="flex h-full flex-col overflow-hidden rounded-card border border-border/90 bg-card shadow-card">
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
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
          Sou a {BRAND.name}, sua assistente jurídica. Como posso te ajudar hoje?
        </p>

        <ul className="mt-5 space-y-2">
          {prompts.map((prompt, i) => {
            const Icon = PROMPT_ICONS[i] ?? Sparkles
            return (
              <li key={prompt}>
                <button
                  type="button"
                  onClick={() => lexa.ask(prompt)}
                  className="group flex w-full items-center gap-3 rounded-[12px] border border-border/90 bg-surface px-3.5 py-3 text-left text-[13px] text-foreground outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-xs focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground group-hover:text-brand" strokeWidth={1.8} />
                  <span className="min-w-0 flex-1">{prompt}</span>
                  <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            )
          })}
        </ul>

        <div className="ai-surface mt-5 rounded-[14px] border border-border/70 p-4">
          <div className="flex gap-3">
            <Sparkles className="mt-0.5 size-[18px] shrink-0 text-brand" strokeWidth={1.8} />
            <div className="min-w-0">
              <p className="text-[13px] leading-relaxed text-foreground">
                {digest.recentMovements
                  ? `${digest.recentMovements} ${digest.recentMovements === 1 ? "processo teve movimentação" : "processos tiveram movimentação"} nos últimos 7 dias.`
                  : "Nenhum processo teve movimentação nos últimos 7 dias."}
              </p>
              <Link
                href="/processos"
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-[12.5px] font-medium text-foreground outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                Ver processos <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
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
