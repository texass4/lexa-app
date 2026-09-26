"use client"

import * as React from "react"
import { Activity, ArrowRight, Bell, Calendar, CircleCheck, Circle, Clock, FilePen, FileText, Gavel, Sparkles } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { MovementDetailSheet } from "./movement-detail-sheet"
import { MOVEMENT_CATEGORY_LABEL, type LexaMovement, type MovementCategory } from "@/lib/services/processes/movement-interpreter"
import { RECENT_DAYS } from "@/lib/attention"
import { diffInDays, fmtDayLabel, fmtRelative, getNow, parse } from "@/lib/dates"

const ICON: Record<MovementCategory, React.ElementType> = {
  documento: FileText,
  prazo: Clock,
  comunicacao: Bell,
  tramitacao: ArrowRight,
  audiencia: Calendar,
  julgamento: Gavel,
  baixa: CircleCheck,
  peticao: FilePen,
  ato: Circle,
  outros: Activity,
}

/** Categorias que costumam pedir leitura do advogado (as mesmas dos sinais de atenção). */
const REVIEW: MovementCategory[] = ["prazo", "julgamento", "comunicacao", "audiencia"]

/**
 * "O que está acontecendo?" em uma linha: a última movimentação, legível, com
 * o convite para entendê-la. A análise da LEXA IA só roda se a pessoa pedir,
 * dentro do detalhe.
 */
export function LatestMovement({ movement }: { movement?: LexaMovement }) {
  const [open, setOpen] = React.useState(false)
  if (!movement) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-dashed border-border px-4 py-3.5 text-[13px] text-muted-foreground">
        <Activity className="size-4 text-subtle" />
        Nenhuma movimentação registrada ainda. Atualize pela fonte para acompanhar o andamento.
      </div>
    )
  }

  const Icon = ICON[movement.category]
  const days = diffInDays(getNow(), parse(movement.at))
  const recent = days >= 0 && days <= RECENT_DAYS
  const review = recent && REVIEW.includes(movement.category)

  return (
    <>
      <section
        aria-label="Última movimentação"
        className={cn(
          "relative flex flex-col gap-3 overflow-hidden rounded-[14px] border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:gap-4",
          recent ? "border-gold/30" : "border-border",
        )}
      >
        {recent && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gold" />}
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[11px] border [&_svg]:size-[18px]",
            recent ? "border-gold/30 bg-gold-soft text-gold-dark" : "border-border bg-surface-muted/60 text-muted-foreground",
          )}
          aria-hidden
        >
          <Icon strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            <span className="font-medium">Última movimentação</span>
            <span className="text-subtle">·</span>
            <span className="tabular">
              {fmtDayLabel(movement.at)} ({fmtRelative(movement.at)})
            </span>
            <span className="rounded-[5px] border border-border bg-surface px-1.5 text-[11px]">{MOVEMENT_CATEGORY_LABEL[movement.category]}</span>
            {recent && <span className="rounded-[5px] bg-gold-soft px-1.5 text-[11px] font-semibold text-gold-dark">Nova</span>}
          </p>
          <p className="mt-1 text-[15px] font-medium leading-snug text-foreground">{movement.title}</p>
          {(movement.description || review) && (
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {review ? `Movimentação de ${MOVEMENT_CATEGORY_LABEL[movement.category].toLowerCase()} — vale revisar.` : movement.description}
            </p>
          )}
        </div>
        <Button variant={recent ? "default" : "secondary"} size="sm" className="shrink-0 self-start sm:self-auto" onClick={() => setOpen(true)}>
          <Sparkles /> Entender movimentação
        </Button>
      </section>
      <MovementDetailSheet movement={movement} open={open} onOpenChange={setOpen} />
    </>
  )
}
