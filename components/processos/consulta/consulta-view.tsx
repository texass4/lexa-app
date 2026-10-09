"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Check, Circle, FileSearch, Minus, RefreshCw, Sparkles, TriangleAlert, X } from "lucide-react"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button, buttonVariants } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { AIErrorNotice, AIFooter, AIPanel, AISection, AIList, AIText, AIThinking, AIUnavailable, AttentionList } from "@/components/ai/ai-blocks"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { useAIAction } from "@/components/ai/use-ai"
import { aiApi } from "@/lib/ai/client"
import type { AIResult, EnrichmentSummary } from "@/lib/ai/types"
import { Can } from "@/lib/auth/session"
import { formatCNJ } from "@/lib/processos/cnj"
import { fetchRun } from "@/lib/services/consulta/client"
import type { EnrichmentRun, RunStatus, StepState } from "@/lib/services/consulta/types"
import { EnrichmentReportView, SourcesPanel, fmtUtc } from "./enrichment-report"
import { StartConsultaForm, useStartConsulta } from "./start-consulta"

const RUN_STATUS: Record<RunStatus, { label: string; tone: "brand" | "success" | "warning" | "danger" }> = {
  running: { label: "Consultando…", tone: "brand" },
  completed: { label: "Concluída", tone: "success" },
  partial: { label: "Parcial", tone: "warning" },
  failed: { label: "Falhou", tone: "danger" },
}

/** Acompanha a execução: lê de novo enquanto estiver rodando (1 s no começo, depois 2,5 s). */
function useRun(runId: string) {
  const [state, setState] = React.useState<{ run?: EnrichmentRun; error?: string }>({})
  React.useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    let reads = 0
    const tick = async () => {
      const result = await fetchRun(runId, controller.signal)
      if (cancelled) return
      reads += 1
      if (!result.ok) {
        setState((s) => ({ ...s, error: result.message }))
        // Consulta inexistente não volta a existir; falha de rede, tenta de novo.
        if (result.code !== "NOT_FOUND" && reads < 120) timer = setTimeout(tick, 4000)
        return
      }
      setState({ run: result.run })
      if (result.run.status === "running" && reads < 400) timer = setTimeout(tick, reads < 20 ? 1000 : 2500)
    }
    tick()
    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [runId])
  return state
}

const STEP_ICON: Record<StepState["status"], { icon: React.ElementType; className: string }> = {
  pending: { icon: Circle, className: "text-subtle" },
  running: { icon: RefreshCw, className: "animate-spin text-brand" },
  done: { icon: Check, className: "text-success" },
  partial: { icon: TriangleAlert, className: "text-warning" },
  failed: { icon: X, className: "text-danger" },
  skipped: { icon: Minus, className: "text-subtle" },
}

function StepsPanel({ run }: { run: EnrichmentRun }) {
  return (
    <Panel>
      <PanelHeader
        title="Etapas"
        description={
          run.status === "running"
            ? "A consulta continua mesmo se você sair desta tela — volte depois para ver o relatório."
            : `Iniciada em ${fmtUtc(run.startedAt)}`
        }
      />
      <ol className="space-y-2.5 px-5 pb-5" aria-live="polite">
        {run.steps.map((step, i) => {
          const { icon: Icon, className } = STEP_ICON[step.status]
          return (
            <li key={step.id} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  step.status === "done" ? "border-success/30 bg-success-soft" : "border-border bg-surface",
                )}
              >
                <Icon className={cn("size-3", className)} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[13px] font-medium", step.status === "pending" ? "text-subtle" : "text-foreground")}>
                  {i + 1}. {step.label}
                  <span className="sr-only"> — {step.status}</span>
                </span>
                {step.detail && <span className="block text-[12px] text-muted-foreground">{step.detail}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

function EnrichmentAIPanel({ run }: { run: EnrichmentRun }) {
  const lexa = useLexaAI()
  const { status, ready } = lexa
  const summary = useAIAction<AIResult<EnrichmentSummary>>()
  const go = () => summary.run((signal) => aiApi.enrichmentSummary(run.id, signal))
  const result = summary.data
  return (
    <AIPanel
      title="Resumir com a Íntegra"
      description="Usa só os dados desta consulta e separa o que está confirmado, o que é inferência e o que falta."
      actions={
        <Button variant="secondary" size="sm" onClick={go} disabled={!ready || summary.loading}>
          <Sparkles /> {result ? "Resumir de novo" : "Resumir"}
        </Button>
      }
    >
      {status && !ready ? (
        <div className="px-5 pb-5">
          <AIUnavailable status={status} />
        </div>
      ) : (
        (summary.loading || summary.error || result) && (
          <div className="space-y-5 border-t border-border px-5 pt-4 pb-5">
            {summary.loading && <AIThinking label="Organizando os dados da consulta…" onCancel={summary.cancel} />}
            {summary.error && <AIErrorNotice error={summary.error} onRetry={go} />}
            {result && !summary.loading && (
              <>
                <p className="text-[13.5px] leading-relaxed text-foreground">
                  <AIText text={result.data.resumo} sources={result.sources} />
                </p>
                <AISection title="Fatos confirmados e inferências">
                  <AttentionList
                    points={[
                      ...result.data.fatos_confirmados.map((f) => ({ texto: f.texto, natureza: "fato" as const, refs: f.refs })),
                      ...result.data.inferencias.map((f) => ({ texto: f.texto, natureza: "inferencia" as const, refs: f.refs })),
                    ]}
                    sources={result.sources}
                  />
                </AISection>
                <AISection title="Informações ausentes">
                  <AIList items={result.data.ausentes} empty="Nenhuma ausência registrada." />
                </AISection>
                {result.data.cuidados.length > 0 && (
                  <AISection title="Cuidados">
                    <AIList items={result.data.cuidados} sources={result.sources} />
                  </AISection>
                )}
                <AIFooter result={result} />
              </>
            )}
          </div>
        )
      )}
    </AIPanel>
  )
}

function RunView({ runId }: { runId: string }) {
  const { run, error } = useRun(runId)
  const { start, pending } = useStartConsulta()

  if (!run) {
    return error ? (
      <Panel>
        <EmptyState icon={<FileSearch />} title="Consulta não encontrada." description={error} />
      </Panel>
    ) : (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-[320px] w-full rounded-card" />
      </div>
    )
  }

  const status = RUN_STATUS[run.status]
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Consulta processual"
        title={<span className="font-mono text-[clamp(18px,4.6vw,28px)]">{formatCNJ(run.cnj)}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {run.finishedAt && <span>Consulta de {fmtUtc(run.finishedAt)}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/processos/consulta" className={buttonVariants({ variant: "secondary" })}>
              Nova consulta
            </Link>
            <Can permission="processes.edit">
              <Button
                onClick={() => start({ processId: run.processId, cnj: run.processId ? undefined : run.cnj, force: true })}
                disabled={pending || run.status === "running"}
              >
                <RefreshCw className={cn(pending && "animate-spin")} /> Consultar novamente
              </Button>
            </Can>
          </div>
        }
      />
      {run.status === "running" || !run.report ? (
        <div className="grid grid-cols-1 gap-5 @4xl/main:grid-cols-2">
          <StepsPanel run={run} />
          <SourcesPanel run={run} />
        </div>
      ) : (
        <>
          <EnrichmentReportView run={run} report={run.report} ai={<EnrichmentAIPanel run={run} />} />
          <details className="group">
            <summary className="cursor-pointer text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
              Ver as etapas da consulta
            </summary>
            <div className="mt-3">
              <StepsPanel run={run} />
            </div>
          </details>
        </>
      )}
    </div>
  )
}

export function ConsultaView() {
  const runId = useSearchParams().get("execucao")
  if (runId) return <RunView key={runId} runId={runId} />
  return (
    <div className="space-y-6">
      <PageHeader
        title="Consultar processo"
        description="Reúne o que as fontes oficiais informam sobre um processo — dados processuais, movimentações, órgão julgador, comunicações publicadas e jurisprudência — com a fonte e a data de cada informação."
      />
      <Panel className="max-w-2xl">
        <div className="p-5 sm:p-6">
          <Can
            permission="processes.edit"
            fallback={<p className="text-[13px] text-muted-foreground">Você pode ver consultas já feitas, mas não iniciar novas.</p>}
          >
            <StartConsultaForm />
          </Can>
        </div>
      </Panel>
    </div>
  )
}
