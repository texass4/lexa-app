"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, CircleAlert, ListChecks, RefreshCw, Settings2, Sparkles, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { PRIORITY_CONFIG } from "@/lib/config"
import { fmtNumericDate, fmtRelative, toLocalISO } from "@/lib/dates"
import type { AIRequestError } from "@/lib/ai/client"
import { CONFIG_ERROR_CODES } from "@/lib/ai/errors"
import type { ActionSuggestion, AIResult, AISource, AISources, AIStatus, AttentionPoint, Confidence, Nature, ReferencedNote } from "@/lib/ai/types"

/* ---------------------------------- marca ---------------------------------- */

export function AIMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-gold/25 bg-gold-soft text-gold-dark [&_svg]:size-4",
        className,
      )}
    >
      <Sparkles strokeWidth={1.8} />
    </span>
  )
}

/** Moldura das áreas da LEXA IA: mesmo cartão das outras seções, com ações rápidas. */
export function AIPanel({
  title = "LEXA IA",
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description: string
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("min-w-0 rounded-[14px] border border-border bg-card shadow-card", className)} aria-label={title}>
      <header className="flex flex-col gap-3 px-5 pt-4.5 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <AIMark />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

/* --------------------------------- estados --------------------------------- */

export function AIThinking({ label, onCancel, className }: { label: string; onCancel?: () => void; className?: string }) {
  return (
    <div className={cn("space-y-4", className)} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-[13px] font-medium text-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold/60" />
            <span className="relative inline-flex size-2 rounded-full bg-gold" />
          </span>
          {label}
        </p>
        {onCancel && (
          <Button variant="ghost" size="xs" onClick={onCancel}>
            <X /> Cancelar
          </Button>
        )}
      </div>
      <div className="space-y-2.5" aria-hidden>
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}

export function AIErrorNotice({ error, onRetry, className }: { error: AIRequestError; onRetry?: () => void; className?: string }) {
  const config = CONFIG_ERROR_CODES.includes(error.code)
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-[12px] border px-3.5 py-3 text-[13px]",
        config ? "border-border bg-surface-muted/50 text-muted-foreground" : "border-danger/15 bg-danger-soft/60 text-danger",
        className,
      )}
    >
      {config ? <Settings2 className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
      <p className="min-w-0 flex-1 leading-snug">{error.message}</p>
      {onRetry && !config && error.code !== "FORBIDDEN" && error.code !== "INSUFFICIENT_DATA" && (
        <Button variant="secondary" size="xs" onClick={onRetry} className="shrink-0">
          <RefreshCw /> Tentar de novo
        </Button>
      )}
    </div>
  )
}

/** Aviso fixo quando a IA está desligada ou sem chave — nada de resposta simulada. */
export function AIUnavailable({ status, className }: { status: AIStatus; className?: string }) {
  const disabled = !status.enabled
  return (
    <div className={cn("flex items-start gap-3 rounded-[12px] border border-border bg-surface-muted/50 px-3.5 py-3", className)}>
      <Settings2 className="mt-0.5 size-4 shrink-0 text-subtle" />
      <div className="min-w-0 text-[13px] leading-snug">
        <p className="font-medium text-foreground">{disabled ? "LEXA IA indisponível" : "LEXA IA não configurada"}</p>
        <p className="mt-0.5 text-muted-foreground">
          {disabled ? (
            "A LEXA IA foi desativada neste ambiente (AI_ENABLED=false)."
          ) : (
            <>
              Configure <code className="rounded bg-surface px-1 font-mono text-[12px]">GEMINI_API_KEY</code> no ambiente do servidor.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export const isAIReady = (status: AIStatus | null) => !status || (status.enabled && status.configured)

/* --------------------------------- fontes ---------------------------------- */

export type SourceHandler = (source: AISource) => void

/** Referência citada pela IA → chip com o registro real (data e nome vêm do banco). */
export function SourceChip({ source, onOpen }: { source: AISource; onOpen?: SourceHandler }) {
  const label = source.date ? `${fmtNumericDate(source.date)} · ${source.label}` : source.label
  const className =
    "inline-flex h-[22px] max-w-full items-center gap-1 rounded-md border border-border bg-surface px-1.5 align-middle text-[11.5px] font-medium text-muted-foreground outline-none transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
  const content = (
    <>
      <span className="font-mono text-[10.5px] text-gold-dark">{source.ref}</span>
      <span className="truncate">{label}</span>
    </>
  )
  if (onOpen) {
    return (
      <button type="button" className={className} onClick={() => onOpen(source)} title={`Ver origem: ${label}`}>
        {content}
      </button>
    )
  }
  if (source.href) {
    return (
      <Link href={source.href} className={className} title={`Ver origem: ${label}`}>
        {content}
      </Link>
    )
  }
  return <span className={className}>{content}</span>
}

export function SourceChips({ refs, sources, onOpen, className }: { refs: string[]; sources: AISources; onOpen?: SourceHandler; className?: string }) {
  const known = refs.map((ref) => sources[ref]).filter(Boolean)
  if (!known.length) return null
  return (
    <span className={cn("mt-1.5 flex flex-wrap gap-1", className)}>
      {known.map((source) => (
        <SourceChip key={source.ref} source={source} onOpen={onOpen} />
      ))}
    </span>
  )
}

/** Marca compacta de uma citação dentro do texto ("M2"); data e nome reais no título. */
function RefMark({ source, onOpen }: { source: AISource; onOpen?: SourceHandler }) {
  const title = `Ver origem: ${source.date ? `${fmtNumericDate(source.date)} · ` : ""}${source.label}`
  const className =
    "mx-0.5 inline-flex h-[18px] items-center rounded-[5px] border border-border bg-surface px-1 align-[1px] font-mono text-[10.5px] font-medium text-gold-dark outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-gold/40"
  if (onOpen) {
    return (
      <button type="button" className={className} title={title} aria-label={title} onClick={() => onOpen(source)}>
        {source.ref}
      </button>
    )
  }
  if (source.href) {
    return (
      <Link href={source.href} className={className} title={title} aria-label={title}>
        {source.ref}
      </Link>
    )
  }
  return <span className={className}>{source.ref}</span>
}

const REF = /(\[[A-Z]\d{1,3}\])/g

/** Texto da IA com as citações "[M2]" viradas em marcas clicáveis; citação desconhecida some. */
export function AIText({ text, sources, onOpen }: { text: string; sources?: AISources; onOpen?: SourceHandler }) {
  if (!sources) return <>{text}</>
  return (
    <>
      {text.split(REF).map((part, i) => {
        const ref = /^\[([A-Z]\d{1,3})\]$/.exec(part)?.[1]
        if (!ref) return <React.Fragment key={i}>{part}</React.Fragment>
        const source = sources[ref]
        return source ? <RefMark key={i} source={source} onOpen={onOpen} /> : null
      })}
    </>
  )
}

/* --------------------------------- conteúdo -------------------------------- */

export function AISection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

export function AIList({ items, empty, sources, onOpen }: { items: string[]; empty?: string; sources?: AISources; onOpen?: SourceHandler }) {
  if (!items.length) return empty ? <p className="text-[13px] text-subtle">{empty}</p> : null
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-foreground">
          <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-subtle" />
          <span className="min-w-0">
            <AIText text={item} sources={sources} onOpen={onOpen} />
          </span>
        </li>
      ))}
    </ul>
  )
}

const NATURE: Record<Nature, { label: string; tone: "neutral" | "info" | "warning" }> = {
  fato: { label: "Fato registrado", tone: "neutral" },
  inferencia: { label: "Inferência da IA", tone: "info" },
  verificacao: { label: "Verificar", tone: "warning" },
}

export function AttentionList({ points, sources, onOpen }: { points: AttentionPoint[]; sources: AISources; onOpen?: SourceHandler }) {
  if (!points.length) return <p className="text-[13px] text-subtle">Nenhum ponto de atenção identificado nos dados.</p>
  return (
    <ul className="space-y-2">
      {points.map((point, i) => (
        <li key={i} className="rounded-[10px] border border-border bg-surface-muted/35 px-3 py-2.5">
          <StatusBadge tone={NATURE[point.natureza].tone} size="sm">
            {NATURE[point.natureza].label}
          </StatusBadge>
          <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
            <AIText text={point.texto} sources={sources} onOpen={onOpen} />
          </p>
          <SourceChips refs={point.refs} sources={sources} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  )
}

/** Notas presas a registros reais: a data e o nome exibidos vêm do LEXA, não do modelo. */
export function NoteList({ notes, sources, onOpen }: { notes: ReferencedNote[]; sources: AISources; onOpen?: SourceHandler }) {
  const visible = notes.filter((note) => sources[note.ref])
  if (!visible.length) return null
  return (
    <ul className="space-y-2.5">
      {visible.map((note) => (
        <li key={note.ref} className="min-w-0">
          <SourceChip source={sources[note.ref]} onOpen={onOpen} />
          {note.comentario && (
            <p className="mt-1 text-[13px] leading-relaxed text-foreground">
              <AIText text={note.comentario} sources={sources} onOpen={onOpen} />
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SuggestionList({
  suggestions,
  sources,
  onOpen,
  onCreate,
}: {
  suggestions: ActionSuggestion[]
  sources: AISources
  onOpen?: SourceHandler
  onCreate?: (suggestion: ActionSuggestion) => void
}) {
  if (!suggestions.length) return <p className="text-[13px] text-subtle">Nenhuma tarefa sugerida com base nos dados disponíveis.</p>
  return (
    <ul className="space-y-2.5">
      {suggestions.map((suggestion, i) => {
        const priority = PRIORITY_CONFIG[suggestion.prioridade]
        return (
          <li key={i} className="rounded-[12px] border border-border bg-surface p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13.5px] font-medium leading-snug text-foreground">{suggestion.titulo}</p>
                  <StatusBadge tone={priority.tone} size="sm">
                    {priority.label}
                  </StatusBadge>
                </div>
                {suggestion.descricao && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    <AIText text={suggestion.descricao} sources={sources} onOpen={onOpen} />
                  </p>
                )}
                {suggestion.justificativa && (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-subtle">
                    <span className="font-medium text-muted-foreground">Por quê: </span>
                    <AIText text={suggestion.justificativa} sources={sources} onOpen={onOpen} />
                  </p>
                )}
                <SourceChips refs={suggestion.refs} sources={sources} onOpen={onOpen} />
              </div>
              {onCreate && (
                <Button variant="secondary" size="sm" className="shrink-0 self-start" onClick={() => onCreate(suggestion)}>
                  <ListChecks /> Criar tarefa
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const CONFIDENCE: Record<Confidence, { label: string; tone: "success" | "warning" | "danger" }> = {
  alto: { label: "Confiança alta", tone: "success" },
  medio: { label: "Confiança média", tone: "warning" },
  baixo: { label: "Confiança baixa", tone: "danger" },
}

export function ConfidenceBadge({ level }: { level: Confidence }) {
  return (
    <StatusBadge tone={CONFIDENCE[level].tone} size="sm">
      {CONFIDENCE[level].label}
    </StatusBadge>
  )
}

/** Avisos da verificação do LEXA sobre a resposta (datas ou prazos sem origem nos dados). */
export function AIWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null
  return (
    <div className="space-y-1.5">
      {warnings.map((warning, i) => (
        <p key={i} className="flex items-start gap-2 rounded-[10px] border border-warning/20 bg-warning-soft/60 px-3 py-2 text-[12.5px] leading-snug text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {warning}
        </p>
      ))}
    </div>
  )
}

/** Rodapé de toda análise: base dos dados, momento e o lembrete de conferir. */
export function AIFooter({ result, confidence }: { result: AIResult<unknown>; confidence?: Confidence }) {
  return (
    <div className="space-y-3 border-t border-border pt-3.5">
      <AIWarnings warnings={result.warnings} />
      <div className="flex flex-col gap-2 text-[11.5px] text-subtle sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-snug">{result.basis} Gerado por IA — confira antes de usar.</p>
        <div className="flex shrink-0 items-center gap-2">
          {confidence && <ConfidenceBadge level={confidence} />}
          <span className="tabular">{result.cached ? "Análise recente" : `Gerado ${fmtRelative(toLocalISO(new Date(result.generatedAt)))}`}</span>
        </div>
      </div>
    </div>
  )
}
