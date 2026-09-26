"use client"

import type * as React from "react"
import { ArrowUpRight, CalendarClock, Hash, Landmark, Tag as TagIcon } from "lucide-react"
import { SideSheet } from "@/components/ui/side-sheet"
import { StatusBadge } from "@/components/ui/status-badge"
import { Eyebrow } from "@/components/ui/panel"
import { fmtNumericDate, fmtTime } from "@/lib/dates"
import { MOVEMENT_CATEGORY_LABEL, type LexaMovement } from "@/lib/services/processes/movement-interpreter"
import { MovementAISection } from "@/components/ai/movement-ai-section"
import { useCreateTaskFromSuggestion } from "@/components/ai/use-ai"
import type { DataOrigin } from "@/types"

const ORIGIN_LABEL: Record<DataOrigin, string> = {
  datajud: "DataJud (CNJ)",
  manual: "Cadastro manual",
}

function Fact({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-subtle" />
      <div className="min-w-0">
        <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
        <dd className="text-[13.5px] font-medium break-words">{children}</dd>
      </div>
    </div>
  )
}

/**
 * Detalhes de uma movimentação. Mostra primeiro o que interessa ao advogado;
 * o objeto original da fonte fica recolhido em "Dados da fonte".
 */
export function MovementDetailSheet({
  movement,
  open,
  onOpenChange,
}: {
  movement: LexaMovement | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // O pai mantém a última movimentação ao fechar, preservando o conteúdo na animação de saída.
  const m = movement
  const createTask = useCreateTaskFromSuggestion({ processId: m?.processId })
  if (!m) return null

  const unit = m.judicialUnit
  const raw = m.raw === undefined ? null : JSON.stringify(m.raw, null, 2)

  return (
    <SideSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Movimentação: ${m.title}`}
      header={
        <div className="border-b border-border px-5 pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-1.5 pr-10">
            <StatusBadge tone="neutral">{MOVEMENT_CATEGORY_LABEL[m.category]}</StatusBadge>
          </div>
          <h2 className="mt-3 text-[19px] font-semibold leading-snug tracking-[-0.015em] break-words">{m.title}</h2>
          {m.description && <p className="mt-1 text-[14px] leading-snug break-words text-muted-foreground">{m.description}</p>}
          <p className="tabular mt-2 text-[12.5px] text-subtle">
            {fmtNumericDate(m.at)} · {fmtTime(m.at)}
          </p>
        </div>
      }
    >
      <div className="space-y-6 px-5 py-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Fact icon={CalendarClock} label="Data e hora">
            {fmtNumericDate(m.at)}, {fmtTime(m.at)}
          </Fact>
          {unit?.name && (
            <Fact icon={Landmark} label="Órgão julgador">
              {unit.name}
              {unit.code && <span className="block text-[12px] font-normal text-muted-foreground">Código {unit.code}</span>}
            </Fact>
          )}
          {m.code !== undefined && (
            <Fact icon={Hash} label="Código do movimento">
              <span className="tabular">{m.code}</span>
            </Fact>
          )}
          {m.origin && (
            <Fact icon={TagIcon} label="Fonte">
              {ORIGIN_LABEL[m.origin]}
            </Fact>
          )}
        </dl>

        {m.complements.length > 0 && (
          <section>
            <Eyebrow className="mb-2">Complementos</Eyebrow>
            <dl className="divide-y divide-border rounded-[12px] border border-border">
              {m.complements.map((complement, i) => (
                <div key={i} className="flex flex-col gap-0.5 px-3.5 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="shrink-0 text-[12.5px] text-muted-foreground">{complement.label}</dt>
                  <dd className="text-[13px] font-medium break-words text-foreground sm:text-right">{complement.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {m.document?.available && m.document.url && (
          <a
            href={m.document.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:underline"
          >
            Ver documento{m.document.type ? ` (${m.document.type})` : ""} <ArrowUpRight className="size-3.5 text-subtle" />
          </a>
        )}

        {m.processId && (
          <MovementAISection
            key={m.id}
            processId={m.processId}
            movementId={m.id}
            onCreateTask={
              createTask &&
              ((suggestion) => {
                // Fecha o painel antes de abrir o formulário de tarefa (um diálogo por vez).
                onOpenChange(false)
                createTask(suggestion)
              })
            }
          />
        )}

        {raw && (
          <details className="group rounded-[12px] border border-border">
            <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 [&::-webkit-details-marker]:hidden">
              Dados da fonte
              <span className="ml-1.5 font-normal text-subtle">— registro original, para conferência</span>
            </summary>
            <pre className="max-h-72 overflow-auto border-t border-border bg-surface-muted/60 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-all text-foreground/80 thin-scrollbar">
              {raw}
            </pre>
          </details>
        )}
      </div>
    </SideSheet>
  )
}
