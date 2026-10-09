"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, ArrowUpRight, Ban, BookOpenText, Gavel, History, Landmark, Megaphone, RefreshCw, Scale, Users } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { fmtNumericDate, fmtTime, toLocalISO } from "@/lib/core/dates"
import type { Tone } from "@/lib/core/config"
import { useSession } from "@/lib/auth/session"
import { useOfficeActions } from "@/lib/store/office-store"
import { useUI } from "@/lib/store/ui-store"
import { refreshProcess } from "@/lib/services/processos/client"
import {
  NOT_AVAILABLE,
  SOURCE_STATUS_LABEL,
  type EnrichmentReport,
  type EnrichmentRun,
  type ReportField,
  type ReportValue,
  type SourceId,
  type SourceStatus,
} from "@/lib/services/consulta/types"

/* -------------------------------- helpers -------------------------------- */

const SHORT_SOURCE: Record<SourceId, string> = {
  datajud: "DataJud",
  djen: "DJEN",
  jurisprudencia: "Jurisprudência",
  cadastro: "Cadastro do escritório",
  tribunal: "Tribunal",
}

/** ISO (UTC) → "09/10/2026 14:32" no horário do navegador. */
export function fmtUtc(iso?: string) {
  if (!iso) return undefined
  const local = toLocalISO(new Date(iso))
  return `${fmtNumericDate(local)} ${fmtTime(local)}`
}
const fmtDay = (ymd?: string) => (ymd ? ymd.split("-").reverse().join("/") : undefined)
const fmtLocal = (iso?: string) => (iso ? `${fmtNumericDate(iso)} ${fmtTime(iso)}` : undefined)

export const STATUS_TONE: Record<SourceStatus, Tone> = {
  ok: "success",
  not_found: "neutral",
  unsupported: "neutral",
  unavailable: "danger",
  timeout: "warning",
  rate_limited: "warning",
  skipped: "neutral",
  not_configured: "neutral",
  error: "danger",
}

/** Link para a origem: interno (Íntegra) ou externo (fonte oficial, nova aba). */
function SourceLink({ url, children, className }: { url: string; children: React.ReactNode; className?: string }) {
  const cls = cn("inline-flex items-center gap-0.5 font-medium text-brand-strong underline-offset-4 hover:underline", className)
  if (url.startsWith("/")) {
    return (
      <Link href={url} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>
      {children} <ArrowUpRight className="size-3" />
    </a>
  )
}

function SourceTag({ source }: { source: SourceId }) {
  return (
    <span className="inline-flex h-5 items-center rounded-[6px] border border-border bg-surface-muted/60 px-1.5 text-[10.5px] font-medium text-muted-foreground">
      {SHORT_SOURCE[source]}
    </span>
  )
}

function ValueLine({ value }: { value: ReportValue }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium break-words text-foreground">{value.value}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
        <SourceTag source={value.source} />
        {value.note && <span>{value.note}</span>}
        {value.checkedAt && <span>consultado em {fmtUtc(value.checkedAt)}</span>}
        {value.url && <SourceLink url={value.url}>{value.url.startsWith("/") ? "Abrir" : "Verificar na fonte"}</SourceLink>}
      </p>
    </div>
  )
}

function FieldRow({ field }: { field: ReportField }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12.5px] text-muted-foreground">
        {field.label}
        {field.conflict && (
          <StatusBadge tone="warning" size="sm" dot={false} className="ml-1.5 align-middle">
            Divergência
          </StatusBadge>
        )}
      </dt>
      <dd className="min-w-0 space-y-2">
        {field.values.length ? (
          field.values.map((v, i) => <ValueLine key={`${v.source}-${i}`} value={v} />)
        ) : (
          <p className="text-[13px] text-subtle">{NOT_AVAILABLE}</p>
        )}
      </dd>
    </div>
  )
}

/* -------------------------------- seções --------------------------------- */

function SummaryPanel({ run, report }: { run: EnrichmentRun; report: EnrichmentReport }) {
  const s = report.summary
  return (
    <Panel>
      <PanelHeader
        title="Resumo do processo"
        icon={<Scale />}
        description={`Consulta de ${fmtUtc(report.generatedAt)}${run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)} s` : ""}`}
      />
      <div className="space-y-4 px-5 pb-5">
        {report.notices.length > 0 && (
          <ul className="space-y-2">
            {report.notices.map((n) => (
              <li
                key={n}
                className="flex items-start gap-2 rounded-[10px] border border-warning/25 bg-warning-soft/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                {n}
              </li>
            ))}
          </ul>
        )}
        <div>
          <p className="font-display text-[19px] leading-snug font-semibold tracking-[-0.015em] text-foreground">{s.title}</p>
          <p className="tabular mt-1 font-mono text-[13px] text-muted-foreground">{report.number}</p>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {[
            ["Tribunal", s.tribunal],
            ["Órgão julgador", s.unit],
            ["Situação na fonte", s.situation],
            ["Última movimentação", s.lastMovement ? `${fmtLocal(s.lastMovement.at)} — ${s.lastMovement.title}` : undefined],
            ["Movimentações encontradas", String(s.movementsTotal)],
            ["Campos encontrados", `${run.foundFields.length} · ${run.missingFields.length} indisponíveis`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-[13px] font-medium break-words text-foreground">
                {value || <span className="font-normal text-subtle">{NOT_AVAILABLE}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  )
}

function OfficePanel({ run, report }: { run: EnrichmentRun; report: EnrichmentReport }) {
  const office = report.office
  const { can } = useSession()
  const { openDialog } = useUI()
  const { applyProcessSync, ensureFullProcesses } = useOfficeActions()
  const [applying, setApplying] = React.useState(false)

  if (!office) {
    if (report.summary.notFound || !report.fields.some((f) => f.values.some((v) => v.source === "datajud"))) return null
    return (
      <Panel>
        <PanelHeader title="Cadastro do escritório" description="Este número não está nos processos do escritório." />
        <div className="px-5 pb-5">
          {can("processes.edit") && (
            <Button variant="secondary" onClick={() => openDialog("process", { number: report.number })}>
              Cadastrar processo
            </Button>
          )}
        </div>
      </Panel>
    )
  }

  const apply = async () => {
    setApplying(true)
    try {
      // O histórico completo entra na memória antes de comparar (a lista só tem a última movimentação).
      await ensureFullProcesses([office.processId])
      // A consulta acabou de ir à fonte: o servidor responde do cache do escritório.
      const result = await refreshProcess(office.processId, run.cnj)
      if (!result.ok) {
        toast.error("Não foi possível atualizar o processo.", { description: result.message })
        return
      }
      const { added } = applyProcessSync(office.processId, result.sheet, result.checkedAt)
      toast.success("Processo atualizado.", { description: added ? `${added} movimentação(ões) nova(s).` : "Nenhuma movimentação nova." })
    } catch {
      toast.error("Não foi possível atualizar o processo.")
    } finally {
      setApplying(false)
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Cadastro do escritório"
        description={
          office.manual ? "Cadastrado pelo escritório — preservado pela consulta." : "Preservado pela consulta: nada foi alterado automaticamente."
        }
        action={
          <Link href={`/processos/${office.processId}`} className="text-[12.5px] font-medium text-brand-strong hover:underline">
            Abrir processo
          </Link>
        }
      />
      <div className="space-y-3 px-5 pb-5">
        <p className="text-[13px] font-medium text-foreground">{office.label}</p>
        {office.fields.length > 0 && (
          <ul className="divide-y divide-border rounded-[12px] border border-border">
            {office.fields.map((f) => (
              <li key={f.label} className="grid grid-cols-1 gap-1 px-3 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
                <span className="text-[12px] text-muted-foreground">{f.label}</span>
                <span className="min-w-0 text-[13px]">
                  <span className="font-medium">{f.office}</span>
                  {f.source && f.differs && (
                    <span className="mt-0.5 block text-[12px] text-warning">Fonte pública informa: {f.source} (não aplicado)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{office.applyNote}</p>
        {office.canApply && can("processes.edit") && (
          <Button variant="secondary" onClick={apply} disabled={applying}>
            <RefreshCw className={cn(applying && "animate-spin")} /> {applying ? "Atualizando…" : "Atualizar processo com a consulta"}
          </Button>
        )}
      </div>
    </Panel>
  )
}

function FieldsPanel({ report }: { report: EnrichmentReport }) {
  return (
    <Panel>
      <PanelHeader title="Dados processuais" icon={<Landmark />} description="Cada dado com a fonte, a data da consulta e onde verificar." />
      <dl className="divide-y divide-border px-5 pb-2">
        {report.fields.map((f) => (
          <FieldRow key={f.key} field={f} />
        ))}
      </dl>
      {report.conflicts.length > 0 && (
        <p className="mx-5 mb-5 rounded-[10px] border border-warning/25 bg-warning-soft/40 px-3 py-2.5 text-[12.5px] text-foreground">
          {report.conflicts.length === 1 ? "1 dado diverge" : `${report.conflicts.length} dados divergem`} entre as fontes. Nada foi escolhido
          automaticamente — confira na fonte oficial.
        </p>
      )}
    </Panel>
  )
}

function PartiesPanel({ report }: { report: EnrichmentReport }) {
  const { items, lawyers, note } = report.parties
  return (
    <Panel>
      <PanelHeader title="Partes e representantes" icon={<Users />} description={note} />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Partes</p>
          {items.length ? (
            <ul className="mt-2 space-y-2">
              {items.map((p, i) => (
                <li key={`${p.name}-${i}`} className="rounded-[10px] border border-border bg-surface-muted/40 px-3 py-2.5">
                  <p className="text-[13px] font-medium break-words">{p.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                    {p.pole && <span>{p.pole}</span>}
                    <SourceTag source={p.source} />
                    {p.date && <span>publicação de {fmtDay(p.date)}</span>}
                    {p.url && <SourceLink url={p.url}>Verificar</SourceLink>}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-subtle">{NOT_AVAILABLE}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Advogados</p>
          {lawyers.length ? (
            <ul className="mt-2 space-y-2">
              {lawyers.map((l, i) => (
                <li key={`${l.name}-${i}`} className="rounded-[10px] border border-border bg-surface-muted/40 px-3 py-2.5">
                  <p className="text-[13px] font-medium break-words">{l.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                    {l.oab && <span>OAB {l.oab}</span>}
                    <SourceTag source={l.source} />
                    {l.url && <SourceLink url={l.url}>Verificar</SourceLink>}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-subtle">{NOT_AVAILABLE}</p>
          )}
        </div>
      </div>
    </Panel>
  )
}

function MagistratePanel({ report }: { report: EnrichmentReport }) {
  const m = report.magistrate
  return (
    <Panel>
      <PanelHeader title="Magistrado e órgão julgador" icon={<Gavel />} />
      <div className="space-y-4 px-5 pb-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[11.5px] text-muted-foreground">Órgão julgador</dt>
            <dd className="mt-0.5">{m.unit ? <ValueLine value={m.unit} /> : <span className="text-[13px] text-subtle">{NOT_AVAILABLE}</span>}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11.5px] text-muted-foreground">Tribunal de atuação</dt>
            <dd className="mt-0.5">
              {m.tribunal ? <ValueLine value={m.tribunal} /> : <span className="text-[13px] text-subtle">{NOT_AVAILABLE}</span>}
            </dd>
          </div>
        </dl>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Magistrado</p>
          {m.mentions.length ? (
            <ul className="mt-2 space-y-2">
              {m.mentions.map((x, i) => (
                <li key={`${x.name}-${x.role}-${i}`} className="rounded-[10px] border border-border bg-surface-muted/40 px-3 py-2.5">
                  <p className="text-[13px] font-medium">
                    {x.name} <span className="font-normal text-muted-foreground">· citado(a) como {x.roleLabel}</span>
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">“{x.excerpt}”</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                    <SourceTag source={x.source} />
                    {x.date && <span>comunicação de {fmtDay(x.date)}</span>}
                    {x.url && <SourceLink url={x.url}>Abrir publicação</SourceLink>}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-subtle">Não identificado nas fontes consultadas.</p>
          )}
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{m.note}</p>
          {m.verifyUrl && (
            <p className="mt-1.5 text-[12px]">
              <SourceLink url={m.verifyUrl}>Verificar no site oficial do tribunal</SourceLink>
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}

const MOVEMENTS_STEP = 10

function MovementsPanel({ report }: { report: EnrichmentReport }) {
  const [shown, setShown] = React.useState(MOVEMENTS_STEP)
  const { items, total, truncated } = report.movements
  const comms = report.communications
  return (
    <Panel>
      <PanelHeader title="Movimentações" icon={<History />} description={total ? `${total} movimentação(ões) na fonte principal` : undefined} />
      <div className="space-y-5 px-5 pb-5">
        {items.length ? (
          <ol className="space-y-2.5">
            {items.slice(0, shown).map((m, i) => (
              <li key={`${m.at}-${i}`} className="flex gap-3">
                <span className="tabular w-[118px] shrink-0 pt-0.5 text-[12px] text-muted-foreground">{fmtLocal(m.at)}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-foreground">{m.title}</span>
                  {(m.description || m.unit) && (
                    <span className="block text-[12px] text-muted-foreground">{[m.description, m.unit].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-subtle">{NOT_AVAILABLE}</p>
        )}
        {items.length > shown && (
          <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + MOVEMENTS_STEP * 3)}>
            Mostrar mais ({items.length - shown})
          </Button>
        )}
        {truncated && (
          <p className="text-[12px] text-muted-foreground">O relatório guarda as {items.length} mais recentes; as demais continuam na fonte.</p>
        )}

        {comms.items.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
              <Megaphone className="size-3.5" /> Comunicações publicadas (DJEN)
            </p>
            <ul className="mt-2 space-y-2">
              {comms.items.slice(0, 10).map((c, i) => (
                <li key={`${c.date}-${i}`} className="rounded-[10px] border border-border px-3 py-2.5">
                  <p className="text-[12.5px] font-medium text-foreground">{[fmtDay(c.date), c.type, c.documentType].filter(Boolean).join(" · ")}</p>
                  {c.unit && <p className="text-[12px] text-muted-foreground">{c.unit}</p>}
                  {c.excerpt && <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">{c.excerpt}</p>}
                  {c.url && (
                    <p className="mt-1 text-[12px]">
                      <SourceLink url={c.url}>Abrir publicação oficial</SourceLink>
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {comms.truncated && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                A fonte informa {comms.total} comunicações; o relatório mostra as mais recentes.
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}

function JurisprudencePanel({ report }: { report: EnrichmentReport }) {
  const j = report.jurisprudence
  return (
    <Panel>
      <PanelHeader
        title="Jurisprudência relacionada"
        icon={<BookOpenText />}
        description={
          j.basis.length ? `Pesquisa na base da Íntegra por ${j.basis.join(" · ")}` : "Base de jurisprudência da Íntegra (fontes oficiais)."
        }
      />
      <div className="px-5 pb-5">
        {j.items.length ? (
          <ul className="space-y-2">
            {j.items.map((d) => (
              <li key={d.id} className="rounded-[10px] border border-border px-3 py-2.5">
                <p className="text-[12.5px] font-medium text-foreground">
                  {d.label}
                  {d.date && <span className="font-normal text-muted-foreground"> · {fmtDay(d.date)}</span>}
                </p>
                <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">{d.excerpt}</p>
                <p className="mt-1 flex flex-wrap gap-3 text-[12px]">
                  <SourceLink url={d.href}>Ver decisão</SourceLink>
                  {d.sourceUrl && <SourceLink url={d.sourceUrl}>Fonte oficial</SourceLink>}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-subtle">{j.message ?? "Nenhuma decisão relacionada encontrada na base."}</p>
        )}
        {j.total > j.items.length && (
          <p className="mt-2 text-[12px] text-muted-foreground">{j.total} decisões encontradas; mostrando as mais relevantes.</p>
        )}
      </div>
    </Panel>
  )
}

export function SourcesPanel({ run }: { run: EnrichmentRun }) {
  return (
    <Panel>
      <PanelHeader title="Fontes consultadas" description="Situação, horário e campos de cada fonte nesta consulta." />
      <ul className="divide-y divide-border px-5 pb-3">
        {run.sources.map((s) => {
          // Durante a execução, fonte sem resultado ainda está na fila ou em consulta.
          const waiting = run.status === "running" && !s.finishedAt && !s.message
          return (
            <li key={s.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-foreground">
                  {s.name}
                  {waiting ? (
                    <StatusBadge tone="brand" size="sm" dot={!!s.startedAt}>
                      {s.startedAt ? "Consultando…" : "Aguardando"}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone={STATUS_TONE[s.status]} size="sm" dot={false}>
                      {SOURCE_STATUS_LABEL[s.status]}
                    </StatusBadge>
                  )}
                  {s.cached && (
                    <StatusBadge tone="neutral" size="sm" dot={false}>
                      Consulta recente reaproveitada
                    </StatusBadge>
                  )}
                </p>
                {s.message && <p className="mt-0.5 text-[12px] text-muted-foreground">{s.message}</p>}
                {s.fields.length > 0 && <p className="mt-0.5 text-[12px] text-muted-foreground">Trouxe: {s.fields.join(", ")}</p>}
              </div>
              <div className="shrink-0 text-[11.5px] text-muted-foreground sm:text-right">
                {s.checkedAt && <p>Dados de {fmtUtc(s.checkedAt)}</p>}
                {s.durationMs !== undefined && <p>{s.durationMs < 1000 ? `${s.durationMs} ms` : `${(s.durationMs / 1000).toFixed(1)} s`}</p>}
                {s.dataVersion && <p>Atualizado na fonte: {fmtLocal(s.dataVersion)}</p>}
                {s.url && (
                  <p>
                    <SourceLink url={s.url}>Sobre a fonte</SourceLink>
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function UnavailablePanel({ report }: { report: EnrichmentReport }) {
  return (
    <Panel>
      <PanelHeader
        title="Informações indisponíveis"
        icon={<Ban />}
        description="O que nenhuma fonte consultada trouxe. Nada foi completado ou presumido."
      />
      <ul className="space-y-1.5 px-5 pb-5">
        {report.unavailable.map((u) => (
          <li key={u.label} className="text-[13px]">
            <span className="font-medium text-foreground">{u.label}</span>
            <span className="text-muted-foreground"> — {u.reason}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function LinksPanel({ report }: { report: EnrichmentReport }) {
  if (!report.links.length) return null
  return (
    <Panel>
      <PanelHeader title="Consulta oficial" description="Onde verificar as informações na origem." />
      <ul className="space-y-2 px-5 pb-5">
        {report.links.map((l) => (
          <li key={l.url} className="text-[13px]">
            <SourceLink url={l.url}>{l.label}</SourceLink>
            {l.note && <span className="block text-[12px] text-muted-foreground">{l.note}</span>}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** Relatório completo (seções na ordem pedida; o resumo da IA entra pelo `ai`). */
export function EnrichmentReportView({ run, report, ai }: { run: EnrichmentRun; report: EnrichmentReport; ai?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 @5xl/main:grid-cols-12">
      <div className="min-w-0 space-y-5 @5xl/main:col-span-7">
        <SummaryPanel run={run} report={report} />
        {ai}
        <FieldsPanel report={report} />
        <PartiesPanel report={report} />
        <MagistratePanel report={report} />
        <MovementsPanel report={report} />
      </div>
      <div className="min-w-0 space-y-5 @5xl/main:col-span-5">
        <OfficePanel run={run} report={report} />
        <JurisprudencePanel report={report} />
        <SourcesPanel run={run} />
        <UnavailablePanel report={report} />
        <LinksPanel report={report} />
        <p className="px-1 text-[12px] text-muted-foreground">Última consulta: {fmtUtc(report.generatedAt)}.</p>
      </div>
    </div>
  )
}
