"use client"

import * as React from "react"
import { RefreshCw, ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { fmtDayLabel, fmtNumericDate, fmtTime } from "@/lib/dates"
import { syncProcessById } from "@/lib/services/processes/client"
import { useDemoActions } from "@/lib/store/demo-store"
import type { DataOrigin, Process, ProcessParty } from "@/types"

const PROVIDER_LABEL: Record<DataOrigin, string> = {
  manual: "Cadastro manual",
  datajud: "Consulta processual (DataJud)",
}

interface Fact {
  label: string
  value?: string
}

function FactGrid({ facts }: { facts: Fact[] }) {
  const filled = facts.filter((fact) => !!fact.value)
  if (!filled.length) return null
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
      {filled.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-[11.5px] text-muted-foreground">{fact.label}</dt>
          <dd className="mt-0.5 text-[13px] font-medium break-words text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Dados que vieram da fonte, já dentro do cadastro do escritório. */
export function ProcessSummaryPanel({ process }: { process: Process }) {
  const facts: Fact[] = [
    { label: "Classe", value: process.className },
    { label: "Assunto", value: process.subject },
    { label: "Órgão julgador", value: process.judicialUnit ?? process.court },
    { label: "Tribunal", value: process.tribunal },
    { label: "Sistema", value: process.system },
    { label: "Grau", value: process.degree },
    { label: "Ajuizado em", value: fmtNumericDate(process.distributedAt) },
    { label: "Situação na fonte", value: process.source?.sourceStatus },
  ]

  return (
    <Panel>
      <PanelHeader title="Resumo" description="Informações do processo conforme a fonte consultada." />
      <div className="px-5 pb-5">
        <FactGrid facts={facts} />
      </div>
    </Panel>
  )
}

function PartyList({ title, parties }: { title: string; parties: ProcessParty[] }) {
  if (!parties.length) return null
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">{title}</p>
      <ul className="mt-2 space-y-2">
        {parties.map((party) => (
          <li key={`${title}-${party.name}`} className="rounded-[10px] border border-border bg-surface-muted/40 px-3 py-2.5">
            <p className="text-[13px] font-medium break-words">{party.name}</p>
            {(party.role || party.document) && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">{[party.role, party.document].filter(Boolean).join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProcessPartiesPanel({ process }: { process: Process }) {
  const parties = process.parties
  const total = parties ? parties.active.length + parties.passive.length + parties.others.length : 0

  return (
    <Panel>
      <PanelHeader title="Partes" description={total ? `${total} ${total === 1 ? "parte" : "partes"}` : undefined} />
      {total && parties ? (
        <div className="space-y-4 px-5 pb-5">
          <PartyList title="Polo ativo" parties={parties.active} />
          <PartyList title="Polo passivo" parties={parties.passive} />
          <PartyList title="Outros" parties={parties.others} />
        </div>
      ) : (
        <EmptyState
          compact
          icon={<Users />}
          title="Partes não informadas."
          // Ausência de partes é normal: a fonte pública traz metadados e movimentações.
          description="A fonte consultada não disponibiliza as partes deste processo."
        />
      )}
    </Panel>
  )
}

/** Andamento + ação de sincronizar com a fonte. */
export function ProcessSyncPanel({ process }: { process: Process }) {
  const { applyProcessSync } = useDemoActions()
  const [syncing, setSyncing] = React.useState(false)

  const origin = process.source?.provider ?? "manual"
  const cnj = process.cnj ?? process.number

  const sync = async () => {
    setSyncing(true)
    const result = await syncProcessById(process.id, cnj)
    setSyncing(false)

    if (!result.ok) {
      toast.error("Não foi possível sincronizar.", { description: result.message })
      return
    }

    const { added } = applyProcessSync(process.id, result.sheet)
    if (added > 0) {
      toast.success(added === 1 ? "1 nova movimentação importada." : `${added} novas movimentações importadas.`, {
        description: `Processo ${process.code} atualizado.`,
      })
    } else {
      toast.success("Processo já está atualizado.", { description: "Nenhuma movimentação nova na fonte." })
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Andamento"
        description="Acompanhamento automático das movimentações."
        action={
          <Button variant="secondary" size="sm" onClick={sync} disabled={syncing}>
            <RefreshCw className={cn(syncing && "animate-spin")} />
            {syncing ? "Sincronizando…" : "Atualizar"}
          </Button>
        }
      />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={origin === "datajud" ? "gold" : "neutral"} dot={origin === "datajud"}>
            {PROVIDER_LABEL[origin]}
          </StatusBadge>
          {process.source?.sourceStatus && <StatusBadge tone="neutral">{process.source.sourceStatus}</StatusBadge>}
        </div>

        <dl className="divide-y divide-border">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-[12.5px] text-muted-foreground">Última movimentação</dt>
            <dd className="text-right text-[13px] font-medium">
              {fmtDayLabel(process.lastMovementAt)}, {fmtTime(process.lastMovementAt)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-[12.5px] text-muted-foreground">Última sincronização</dt>
            <dd className="text-right text-[13px] font-medium">
              {process.lastSyncedAt ? `${fmtDayLabel(process.lastSyncedAt)}, ${fmtTime(process.lastSyncedAt)}` : "Nunca sincronizado"}
            </dd>
          </div>
        </dl>

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-subtle">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          A consulta acontece no servidor do LEXA e respeita os limites da fonte. Movimentações já conhecidas não são importadas de novo.
        </p>
      </div>
    </Panel>
  )
}
