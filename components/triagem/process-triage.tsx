"use client"

import * as React from "react"
import { Inbox } from "lucide-react"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { StatusBadge } from "@/components/ui/status-badge"
import { getUser } from "@/lib/auth/account"
import { fmtNumericDate } from "@/lib/core/dates"
import { KIND_LABEL, SOURCE_LABEL, stateBadge, summaryOf } from "@/lib/triagem/model"
import type { Process, TriageItem } from "@/types"
import { useTriagemOptional } from "./triagem-provider"
import { TriageSheet } from "./triage-sheet"

/**
 * Eventos da Triagem ligados ao processo, na página dele: tipo, origem, data, resumo,
 * responsável e situação. Os antigos vêm do banco; os novos chegam pelo tempo real.
 * Sem evento, o painel não aparece.
 */
export function ProcessTriagePanel({ process }: { process: Process }) {
  const ctx = useTriagemOptional()
  const [older, setOlder] = React.useState<TriageItem[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const ofProcess = ctx?.ofProcess

  React.useEffect(() => {
    if (!ofProcess) return
    let cancelled = false
    void ofProcess(process.id).then((list) => !cancelled && setOlder(list))
    return () => {
      cancelled = true
    }
  }, [ofProcess, process.id])

  if (!ctx) return null
  // Tempo real (provider) por cima do que veio do banco — o mesmo evento uma vez só.
  const live = ctx.items.filter((i) => i.processId === process.id)
  const merged = [
    ...live,
    ...older.filter((o) => !live.some((l) => l.id === o.id) && !ctx.items.some((i) => i.id === o.id && i.processId !== process.id)),
  ].sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.createdAt.localeCompare(a.createdAt))
  if (!merged.length) return null
  const selected = merged.find((i) => i.id === selectedId)

  return (
    <Panel>
      <PanelHeader title="Triagem" description={`${merged.length} ${merged.length === 1 ? "evento" : "eventos"} deste processo`} icon={<Inbox />} />
      <ul className="divide-y divide-border border-t border-border">
        {merged.map((i) => {
          const badge = stateBadge(i)
          const responsible = i.responsibleId ? getUser(i.responsibleId) : undefined
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setSelectedId(i.id)}
                className="w-full px-5 py-3 text-left outline-none hover:bg-accent/40 focus-visible:bg-accent/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium">
                    {KIND_LABEL[i.kind]} · {fmtNumericDate(i.eventDate)}
                  </span>
                  <StatusBadge tone={badge.tone} size="sm">
                    {badge.label}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-[12px] text-subtle">
                  {[SOURCE_LABEL[i.source], i.tribunal, i.title, responsible && `Responsável: ${responsible.firstName}`].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{summaryOf(i)}</p>
              </button>
            </li>
          )
        })}
      </ul>
      <TriageSheet item={selected} onOpenChange={(open) => !open && setSelectedId(null)} />
    </Panel>
  )
}
