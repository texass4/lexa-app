"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, BookOpenText, Link2, Search, Sparkles, Unlink } from "lucide-react"
import { toast } from "sonner"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/lib/auth/session"
import { aiApi, type RelatedJurisprudenceResult } from "@/lib/ai/client"
import type { Similarity } from "@/lib/ai/types"
import { AIErrorNotice, AIFooter, AIList, AISection, AIThinking, AIUnavailable } from "@/components/ai/ai-blocks"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { useAIAction } from "@/components/ai/use-ai"
import type { Process } from "@/types"
import { jurisApi, type LinkedEntry, type RelatedResponse } from "./api"
import { DecisionSheet, type DecisionChange } from "./decision-sheet"
import { decisionMeta, decisionTitle, ResultRow } from "./result-row"

const SIMILARITY: Record<Similarity, { label: string; tone: "success" | "info" | "neutral" }> = {
  alta: { label: "Semelhança alta", tone: "success" },
  media: { label: "Semelhança média", tone: "info" },
  baixa: { label: "Semelhança baixa", tone: "neutral" },
}

/**
 * Jurisprudência do processo: as decisões vinculadas e, quando a pessoa pede, a
 * pesquisa de decisões relacionadas (assunto, tipo de ação, classe e área do processo)
 * e a Análise da Íntegra sobre esses resultados. Nada de pesquisa ao abrir a página.
 */
export function ProcessJurisprudencePanel({ process }: { process: Process }) {
  const { can } = useSession()
  const editable = can("processes.edit")
  const [linked, setLinked] = React.useState<LinkedEntry[] | null>(null)
  const [linkedError, setLinkedError] = React.useState<string>()
  const [related, setRelated] = React.useState<{ loading: boolean; data?: RelatedResponse; error?: string }>({ loading: false })
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set())
  const [selected, setSelected] = React.useState<string>()
  const [reload, setReload] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    jurisApi
      .linked(process.id)
      .then((r) => !cancelled && setLinked(r.entries))
      .catch((e: Error) => {
        if (cancelled) return
        setLinked([])
        // Sem a migração/fonte, a seção fica discreta (sem erro técnico).
        setLinkedError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [process.id, reload])

  const search = async () => {
    setRelated({ loading: true })
    try {
      const data = await jurisApi.related(process.id)
      setRelated({ loading: false, data })
      setSavedIds(new Set(data.savedIds))
    } catch (e) {
      setRelated({ loading: false, error: (e as Error).message })
    }
  }

  const linkedIds = new Set((linked ?? []).map((l) => l.decision.id))

  const link = async (id: string) => {
    try {
      await jurisApi.link(id, process.id)
      toast.success("Jurisprudência vinculada ao processo.")
      setReload((n) => n + 1)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const unlink = async (id: string) => {
    try {
      await jurisApi.unlink(id, process.id)
      setLinked((list) => (list ?? []).filter((l) => l.decision.id !== id))
      toast.success("Vínculo removido.")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const toggleSave = async (id: string) => {
    const was = savedIds.has(id)
    try {
      if (was) await jurisApi.unsave(id)
      else await jurisApi.save(id)
      setSavedIds((prev) => {
        const next = new Set(prev)
        if (was) next.delete(id)
        else next.add(id)
        return next
      })
      toast.success(was ? "Removida das salvas." : "Jurisprudência salva no escritório.")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const onChange = (change: DecisionChange) => {
    if (change.linked?.processId === process.id) setReload((n) => n + 1)
    if (change.saved !== undefined) {
      setSavedIds((prev) => {
        const next = new Set(prev)
        if (change.saved) next.add(change.id)
        else next.delete(change.id)
        return next
      })
    }
  }

  const count = linked?.length ?? 0

  return (
    <Panel>
      <PanelHeader
        title="Jurisprudência relacionada"
        icon={<BookOpenText />}
        description={linked === null ? "Carregando…" : count ? `${count} ${count === 1 ? "decisão vinculada" : "decisões vinculadas"}` : "Nenhuma decisão vinculada"}
        action={
          <Button size="sm" variant="secondary" onClick={() => void search()} disabled={related.loading}>
            <Search /> {related.data ? "Pesquisar de novo" : "Pesquisar jurisprudência relacionada"}
          </Button>
        }
      />

      {linked === null ? (
        <div className="space-y-2 px-5 pb-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : count > 0 ? (
        <ul className="divide-y divide-border border-t border-border">
          {linked.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
              <button type="button" onClick={() => setSelected(entry.decision.id)} className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                <span className="block text-[13px] font-medium">
                  {entry.decision.tribunal} · {decisionTitle(entry.decision)}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">{decisionMeta(entry.decision)}</span>
                {entry.decision.subject && <span className="mt-0.5 line-clamp-1 block text-[11.5px] text-subtle">{entry.decision.subject}</span>}
              </button>
              <Button size="xs" variant="secondary" onClick={() => setSelected(entry.decision.id)}>
                Ver
              </Button>
              {editable && (
                <Button size="xs" variant="ghost" onClick={() => void unlink(entry.decision.id)} aria-label="Desvincular">
                  <Unlink />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !related.data &&
        !related.loading && (
          <p className="px-5 pb-4 text-[12.5px] text-muted-foreground">
            {linkedError ?? "Pesquise decisões a partir do assunto, da classe e da área deste processo — e vincule as que servirem."}
          </p>
        )
      )}

      {(related.loading || related.error || related.data) && (
        <div className="border-t border-border">
          {related.loading && (
            <div className="space-y-2 px-5 py-4" aria-busy="true">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}
          {related.error && <p className="px-5 py-4 text-[13px] text-muted-foreground">{related.error}</p>}
          {related.data && (
            <RelatedResults
              process={process}
              data={related.data}
              savedIds={savedIds}
              linkedIds={linkedIds}
              editable={editable}
              onOpen={setSelected}
              onSave={(id) => void toggleSave(id)}
              onLink={(id) => void link(id)}
            />
          )}
        </div>
      )}

      <DecisionSheet id={selected} onOpenChange={(o) => !o && setSelected(undefined)} processId={process.id} query={related.data?.query.text} onChange={onChange} />
    </Panel>
  )
}

function RelatedResults({
  process,
  data,
  savedIds,
  linkedIds,
  editable,
  onOpen,
  onSave,
  onLink,
}: {
  process: Process
  data: RelatedResponse
  savedIds: Set<string>
  linkedIds: Set<string>
  editable: boolean
  onOpen: (id: string) => void
  onSave: (id: string) => void
  onLink: (id: string) => void
}) {
  const { status, ready } = useLexaAI()
  const analysis = useAIAction<RelatedJurisprudenceResult>()
  const ids = data.results.map((r) => r.id)
  const run = () => analysis.run((signal) => aiApi.relatedJurisprudence({ processId: process.id, ids }, signal))
  const result = analysis.data
  // Semelhança por decisão (só referências reais: o servidor já descartou as inventadas).
  const similarity = new Map<string, Similarity>()
  for (const d of result?.data.decisoes ?? []) {
    const id = result?.sources[d.ref]?.id
    if (id) similarity.set(id, d.semelhanca)
  }

  return (
    <>
      <div className="space-y-2 px-5 pt-4 pb-3">
        <p className="text-[13.5px] font-medium">{data.sentence}</p>
        {data.query.basis.length > 0 && <p className="text-[12px] text-muted-foreground">Com base em {data.query.basis.join(" · ")}.</p>}
        {data.results.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!(status && !ready) && (
              <Button size="sm" variant="secondary" onClick={run} disabled={!ready || analysis.loading}>
                <Sparkles /> {result ? "Analisar de novo" : "Análise da Íntegra"}
              </Button>
            )}
            <Link
              href={`/jurisprudencia?q=${encodeURIComponent(data.query.text)}&processo=${encodeURIComponent(process.id)}`}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-strong hover:underline"
            >
              Abrir na pesquisa <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
        {status && !ready && data.results.length > 0 && <AIUnavailable status={status} />}
        {analysis.error && <AIErrorNotice error={analysis.error} onRetry={run} />}
        {analysis.loading && <AIThinking label="Comparando o processo com as decisões encontradas…" onCancel={analysis.cancel} />}
        {result && !analysis.loading && (
          <div className="ai-surface space-y-3 rounded-[12px] border border-border/80 p-3.5">
            <p className="text-[13px] font-medium">
              {result.counts.alta === 0
                ? `Nenhuma das ${result.analyzed} decisões analisadas apresenta contexto altamente semelhante.`
                : `${result.counts.alta} das ${result.analyzed} decisões analisadas ${result.counts.alta === 1 ? "apresenta" : "apresentam"} contexto altamente semelhante.`}
            </p>
            <p className="text-[13px] leading-relaxed text-foreground">{result.data.visao_geral}</p>
            {result.data.cuidados.length > 0 && (
              <AISection title="Limites desta comparação">
                <AIList items={result.data.cuidados} />
              </AISection>
            )}
            <AIFooter result={result} />
          </div>
        )}
      </div>
      {data.results.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {data.results.map((r) => {
            const s = similarity.get(r.id)
            const isLinked = linkedIds.has(r.id)
            return (
              <ResultRow
                key={r.id}
                result={r}
                searched
                saved={savedIds.has(r.id)}
                onOpen={() => onOpen(r.id)}
                onToggleSave={() => onSave(r.id)}
                badge={
                  s ? (
                    <StatusBadge tone={SIMILARITY[s].tone} size="sm" dot={false}>
                      {SIMILARITY[s].label}
                    </StatusBadge>
                  ) : undefined
                }
                actions={
                  editable &&
                  (isLinked ? (
                    <span className="text-[12px] font-medium text-success">Vinculada</span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => onLink(r.id)}>
                      <Link2 /> Vincular
                    </Button>
                  ))
                }
              />
            )
          })}
        </ul>
      )}
    </>
  )
}
