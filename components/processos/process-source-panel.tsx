"use client"

import { CircleAlert, RefreshCw, ShieldCheck, Users } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { fmtDayLabel, fmtNumericDate, fmtShortDate, fmtTime } from "@/lib/dates"
import { degreeLabel, isAutoTracked, ORIGIN_LABEL } from "@/lib/services/processes/labels"
import type { Process, ProcessParty } from "@/types"
import type { RefreshState } from "./use-process-refresh"

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
    { label: "Grau", value: degreeLabel(process.degree) },
    { label: "Ajuizado em", value: fmtNumericDate(process.distributedAt) },
    { label: "Situação no tribunal", value: process.source?.sourceStatus },
  ]

  return (
    <Panel>
      <PanelHeader title="Resumo" description="Informações públicas do processo." />
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
          // Ausência de partes é normal: a consulta pública traz metadados e movimentações.
          description="Algumas informações não estão disponíveis para este processo."
        />
      )}
    </Panel>
  )
}

/** Andamento + atualização automática das informações. */
export function ProcessSyncPanel({
  process,
  state,
  canRefresh,
  onRefresh,
}: {
  process: Process
  state: RefreshState
  canRefresh: boolean
  onRefresh: () => void
}) {
  const origin = process.source?.provider ?? "manual"
  const auto = isAutoTracked(origin)
  const refreshing = state.status === "refreshing"

  return (
    <Panel>
      <PanelHeader
        title="Andamento"
        description={auto ? "Acompanhamento automático das movimentações." : "Processo cadastrado manualmente."}
        action={
          canRefresh && (
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && "animate-spin")} />
              {refreshing ? "Atualizando…" : "Atualizar"}
            </Button>
          )
        }
      />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={auto ? "brand" : "neutral"} dot={auto}>
            {ORIGIN_LABEL[origin]}
          </StatusBadge>
          {process.source?.sourceStatus && <StatusBadge tone="neutral">{process.source.sourceStatus}</StatusBadge>}
        </div>

        {state.status === "error" && (
          <div role="status" className="flex items-start gap-2.5 rounded-[10px] border border-danger/20 bg-danger-soft/50 px-3 py-2.5">
            <CircleAlert className="mt-px size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-foreground">Não foi possível atualizar as informações deste processo.</p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{state.message}</p>
            </div>
            <Button variant="ghost" size="sm" className="-my-1 shrink-0" onClick={onRefresh}>
              Tentar novamente
            </Button>
          </div>
        )}

        <dl className="divide-y divide-border">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-[12.5px] text-muted-foreground">Última movimentação</dt>
            <dd className="text-right text-[13px] font-medium">
              {fmtDayLabel(process.lastMovementAt)}, {fmtTime(process.lastMovementAt)}
            </dd>
          </div>
          {auto && (
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[12.5px] text-muted-foreground">Última consulta</dt>
              <dd className="text-right text-[13px] font-medium">
                {refreshing ? (
                  <span className="text-muted-foreground">Atualizando…</span>
                ) : process.lastSyncedAt ? (
                  `${fmtDayLabel(process.lastSyncedAt)}, ${fmtTime(process.lastSyncedAt)}`
                ) : (
                  "Aguardando atualização"
                )}
              </dd>
            </div>
          )}
        </dl>

        {auto && (
          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-subtle">
            <ShieldCheck className="mt-px size-3.5 shrink-0" />
            <span>
              {/* A última sincronização real do monitoramento automático (servidor), não a consulta feita ao abrir. */}
              {process.autoSyncedAt
                ? `Atualizado automaticamente em ${fmtShortDate(process.autoSyncedAt)} às ${fmtTime(process.autoSyncedAt)}.`
                : "Ainda não foi atualizado automaticamente."}{" "}
              Movimentações já conhecidas não são importadas de novo.
            </span>
          </p>
        )}
      </div>
    </Panel>
  )
}
