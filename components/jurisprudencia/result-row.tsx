"use client"

import * as React from "react"
import { Bookmark, BookmarkCheck, ExternalLink } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { fmtNumericDate } from "@/lib/core/dates"
import type { JurisprudenceResult } from "@/lib/services/jurisprudence/types"

/** "REsp 1953607" — classe e número como a fonte informa. */
export function decisionTitle(d: Pick<JurisprudenceResult, "classCode" | "processNumber" | "className">) {
  return [d.classCode ?? d.className, d.processNumber].filter(Boolean).join(" ") || "Decisão sem número informado"
}

/** "TERCEIRA TURMA · Rel. NANCY ANDRIGHI · 19/04/2022" — só o que existe. */
export function decisionMeta(d: Pick<JurisprudenceResult, "court" | "rapporteur" | "judgmentDate">) {
  return [d.court, d.rapporteur && `Rel. ${d.rapporteur}`, d.judgmentDate && `julgado em ${fmtNumericDate(d.judgmentDate)}`].filter(Boolean).join(" · ")
}

/** Trecho da ementa com os termos encontrados destacados (marcados ⟦ ⟧ pelo banco). Texto puro: nada vira HTML. */
export function Snippet({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/g)
  return (
    <p className={cn("text-[12.5px] leading-relaxed text-muted-foreground", className)}>
      {parts.map((part, i) =>
        part.startsWith("⟦") && part.endsWith("⟧") ? (
          <mark key={i} className="rounded-[3px] bg-brand-soft px-0.5 text-foreground">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </p>
  )
}

/** Relevância dita com honestidade: o banco só sabe se todos os termos aparecem. */
export function relevanceLabel(score: number, searched: boolean) {
  if (!searched) return undefined
  return score >= 1 ? "Contém todos os termos" : "Contém parte dos termos"
}

export function ResultRow({
  result,
  saved,
  searched,
  onOpen,
  onToggleSave,
  saving,
  actions,
  badge,
}: {
  result: JurisprudenceResult
  saved: boolean
  /** Houve termos de pesquisa (mostra a relevância). */
  searched: boolean
  onOpen: () => void
  onToggleSave?: () => void
  saving?: boolean
  /** Ações extras (ex.: Vincular). */
  actions?: React.ReactNode
  /** Selo extra (ex.: semelhança apontada pela Análise da Íntegra). */
  badge?: React.ReactNode
}) {
  const relevance = relevanceLabel(result.score, searched)
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-accent/40 sm:px-5 lg:flex-row lg:items-start lg:gap-6">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-[8px] text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="brand" size="sm" dot={false}>
            {result.tribunal}
          </StatusBadge>
          <span className="text-[13.5px] font-semibold text-foreground">{decisionTitle(result)}</span>
          {badge}
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-strong">
              <BookmarkCheck className="size-3.5" /> Salva
            </span>
          )}
        </span>
        <span className="mt-1 block text-[12px] text-muted-foreground">{decisionMeta(result)}</span>
        {result.subject && <span className="mt-1 line-clamp-1 block text-[11.5px] font-medium tracking-[0.01em] text-subtle">{result.subject}</span>}
        {result.snippet && <Snippet text={result.snippet} className="mt-1.5 line-clamp-3" />}
        {relevance && <span className="mt-1.5 block text-[11.5px] text-subtle">{relevance}</span>}
      </button>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          Ver
        </Button>
        {onToggleSave && (
          <Button size="sm" variant="ghost" onClick={onToggleSave} disabled={saving} aria-pressed={saved}>
            {saved ? <BookmarkCheck /> : <Bookmark />} {saved ? "Salva" : "Salvar"}
          </Button>
        )}
        {actions}
        {result.sourceUrl && (
          <a
            href={result.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Fonte original de ${decisionTitle(result)}`}
            className="touch-target relative flex size-8 items-center justify-center rounded-[8px] text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </li>
  )
}
