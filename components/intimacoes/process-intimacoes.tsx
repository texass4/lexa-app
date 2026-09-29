"use client"

import * as React from "react"
import { Inbox } from "lucide-react"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { StatusBadge } from "@/components/ui/status-badge"
import { fmtNumericDate } from "@/lib/dates"
import { formatOab } from "@/lib/intimacoes/oab"
import { TRIAGE_STATUS, byTriageOrder } from "@/lib/intimacoes/rows"
import { readableContent } from "@/lib/integrations/legal/djen/mapper"
import type { Intimacao, Process } from "@/types"
import { useIntimacoesOptional } from "./intimacoes-provider"
import { IntimacaoSheet } from "./intimacao-sheet"

/**
 * Intimações vinculadas ao processo, na página dele: publicação, origem, teor, OAB e
 * situação. As antigas vêm do banco; as novas chegam pelo tempo real. Sem intimação,
 * o painel não aparece.
 */
export function ProcessIntimacoesPanel({ process }: { process: Process }) {
  const ctx = useIntimacoesOptional()
  const [older, setOlder] = React.useState<Intimacao[]>([])
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
  // Tempo real (provider) por cima do que veio do banco — a mesma intimação uma vez só.
  const live = ctx.items.filter((i) => i.processId === process.id)
  const merged = [
    ...live,
    ...older.filter((o) => !live.some((l) => l.id === o.id) && !ctx.items.some((i) => i.id === o.id && i.processId !== process.id)),
  ].sort(byTriageOrder)
  if (!merged.length) return null
  const selected = merged.find((i) => i.id === selectedId)

  return (
    <Panel>
      <PanelHeader
        title="Intimações"
        description={`${merged.length} ${merged.length === 1 ? "publicação" : "publicações"} do DJEN`}
        icon={<Inbox />}
      />
      <ul className="divide-y divide-border border-t border-border">
        {merged.map((i) => {
          const oab = ctx.oabs.find((o) => i.oabIds.includes(o.id))
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setSelectedId(i.id)}
                className="w-full px-5 py-3 text-left outline-none hover:bg-accent/40 focus-visible:bg-accent/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium">Publicada em {fmtNumericDate(i.publishedAt ?? i.availableAt)}</span>
                  <StatusBadge tone={TRIAGE_STATUS[i.status].tone} size="sm">
                    {TRIAGE_STATUS[i.status].label}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-[12px] text-subtle">
                  {[i.tribunal ? `DJEN · ${i.tribunal}` : "DJEN", i.tipoComunicacao, i.orgao, oab && formatOab(oab)].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{readableContent(i.content)}</p>
              </button>
            </li>
          )
        })}
      </ul>
      <IntimacaoSheet intimacao={selected} onOpenChange={(open) => !open && setSelectedId(null)} />
    </Panel>
  )
}
