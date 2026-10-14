"use client"

import { CircleAlert, FileSearch, RefreshCw, ShieldCheck, Users } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { fmtDayLabel, fmtNumericDate, fmtShortDate, fmtTime } from "@/lib/core/dates"
import { degreeLabel, isAutoTracked, ORIGIN_LABEL } from "@/lib/services/processos/labels"
import { ATTEMPT_LABEL, CURRENT_STATUS_LABEL, staleAttempt, tribunalIdentificationOf, tribunalLabel } from "@/lib/services/processos/tribunal-identification"
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

/** De onde vêm as informações do resumo — o cadastro do escritório nunca é apresentado como dado público. */
function summaryOrigin(process: Process) {
  if (process.origin !== "manual") return "Informações públicas do processo."
  return isAutoTracked(process.source?.provider)
    ? "Cadastradas pelo escritório e complementadas pela consulta pública."
    : "Informações cadastradas pelo escritório."
}

/** "03/10/2026 14:32" de um horário local sem fuso (as datas da identificação já vêm normalizadas). */
const when = (iso?: string) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return undefined
  const date = iso.slice(0, 10).split("-").reverse().join("/")
  const time = /T(\d{2}:\d{2})/.exec(iso)?.[1]
  return time && time !== "00:00" ? `${date} ${time}` : date
}

/** Tribunal de origem (pelo número) × atual (pela fonte), com o porquê e a última tentativa. */
function TribunalFacts({ process }: { process: Process }) {
  const id = tribunalIdentificationOf(process)
  if (!id) return null
  const { current, inferred } = id
  const confirmed = current.status === "confirmed"
  const conflicting = current.status === "conflicting"
  const stale = staleAttempt(id)
  const currentText = confirmed
    ? [tribunalLabel(current.acronym, current.name), current.degree && degreeLabel(current.degree)].filter(Boolean).join(" · ")
    : CURRENT_STATUS_LABEL[current.status]
  return (
    <div className="mt-4 rounded-[10px] border border-border bg-surface-muted/40 px-3.5 py-3">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[11.5px] text-muted-foreground">Tribunal de origem (pelo número)</dt>
          <dd className="mt-0.5 text-[13px] font-medium break-words text-foreground">{tribunalLabel(id.origin.acronym, id.origin.name) ?? "Não identificado"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11.5px] text-muted-foreground">Tribunal atual</dt>
          <dd className="mt-0.5 text-[13px] font-medium break-words text-foreground">{currentText}</dd>
          {confirmed && current.checkedAt && (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">Última confirmação válida: {when(current.checkedAt)} (fonte pública)</p>
          )}
          {conflicting && id.candidates?.length ? (
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Tribunais com registro: {id.candidates.map((c) => `${c.acronym}${c.degrees.length ? ` (${c.degrees.join(", ")})` : ""}`).join(" · ")}. Nenhum
              foi escolhido.
            </p>
          ) : null}
          {!confirmed && !conflicting && inferred && (
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Inferido, não confirmado: {tribunalLabel(inferred.acronym, inferred.name)}. {inferred.note}
            </p>
          )}
        </div>
      </dl>
      {id.lastAttempt && (
        <p className={cn("mt-2.5 text-[11.5px]", stale ? "text-warning" : "text-muted-foreground")}>
          Última tentativa de consulta: {when(id.lastAttempt.at)} — {ATTEMPT_LABEL[id.lastAttempt.outcome]}
          {stale && confirmed ? ". A confirmação acima não foi revalidada." : "."}
        </p>
      )}
      {current.reasons.length > 0 && (
        <ul className="mt-2.5 space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
          {current.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Dados que vieram da fonte, já dentro do cadastro do escritório. */
export function ProcessSummaryPanel({ process }: { process: Process }) {
  const facts: Fact[] = [
    { label: "Classe", value: process.className },
    { label: "Assunto", value: process.subject },
    // Na fonte, o órgão vem do registro mais recente — não necessariamente o atual.
    { label: process.origin === "manual" ? "Órgão julgador" : "Órgão julgador (registro mais recente da fonte)", value: process.judicialUnit ?? process.court },
    { label: process.origin === "manual" ? "Tribunal (cadastro do escritório)" : "Tribunal informado pela fonte", value: process.tribunal },
    { label: "Sistema", value: process.system },
    { label: "Grau", value: degreeLabel(process.degree) },
    { label: "Ajuizado em", value: fmtNumericDate(process.distributedAt) },
    { label: "Situação no tribunal", value: process.source?.sourceStatus },
  ]

  return (
    <Panel>
      <PanelHeader title="Resumo" description={summaryOrigin(process)} />
      <div className="px-5 pb-5">
        <FactGrid facts={facts} />
        <TribunalFacts process={process} />
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
  onConsult,
}: {
  process: Process
  state: RefreshState
  canRefresh: boolean
  onRefresh: () => void
  /** "Consultar processo": relatório completo das fontes (quando o processo tem CNJ). */
  onConsult?: () => void
}) {
  const origin = process.source?.provider ?? "manual"
  const auto = isAutoTracked(origin)
  const refreshing = state.status === "refreshing"

  return (
    <Panel>
      <PanelHeader
        title="Andamento"
        description={
          process.secret
            ? "Segredo de justiça: sem consulta pública. As informações são as cadastradas pelo escritório."
            : auto
              ? "Acompanhamento automático das movimentações."
              : "Processo cadastrado pelo escritório."
        }
        action={
          (canRefresh || onConsult) && (
            <div className="flex flex-wrap gap-2">
              {onConsult && (
                <Button variant="ghost" size="sm" onClick={onConsult}>
                  <FileSearch /> Consultar
                </Button>
              )}
              {canRefresh && (
                <Button variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
                  <RefreshCw className={cn(refreshing && "animate-spin")} />
                  {refreshing ? "Atualizando…" : "Atualizar"}
                </Button>
              )}
            </div>
          )
        }
      />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={auto ? "brand" : "neutral"} dot={auto}>
            {ORIGIN_LABEL[origin]}
          </StatusBadge>
          {process.secret && (
            <StatusBadge tone="warning" dot={false}>
              Segredo de justiça
            </StatusBadge>
          )}
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
