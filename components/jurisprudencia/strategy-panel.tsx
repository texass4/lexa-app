"use client"

import * as React from "react"
import { ChevronDown, Quote, Scale, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TextArea } from "@/components/ui/field"
import { StatusBadge } from "@/components/ui/status-badge"
import { aiApi, type JurisprudenceStrategyResult } from "@/lib/ai/client"
import type { AISource, StrategyRetrievalView } from "@/lib/ai/types"
import { fmtNumericDate } from "@/lib/core/dates"
import { cn } from "cn"
import { AIErrorNotice, AIFooter, AIList, AISection, AIText, AIThinking, AIUnavailable } from "@/components/ai/ai-blocks"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { useAIAction } from "@/components/ai/use-ai"
import type { Process } from "@/types"

type Precedent = StrategyRetrievalView["precedentes"][number]

const DEFAULT_QUESTION = "Quais precedentes da base se aplicam a este processo e quais estratégias merecem ser avaliadas?"

const STANCE: Record<Precedent["posicaoCliente"], { label: string; tone: "success" | "danger" | "neutral" }> = {
  favoravel: { label: "Favorável ao cliente", tone: "success" },
  contraria: { label: "Contrária ao cliente", tone: "danger" },
  indeterminada: { label: "Posição não identificada", tone: "neutral" },
}
const THESIS: Record<Precedent["posicao"], { label: string; tone: "info" | "warning" | "neutral" }> = {
  acolhe: { label: "Acolhe a tese", tone: "info" },
  rejeita: { label: "Rejeita a tese", tone: "warning" },
  indeterminada: { label: "Posição não identificada", tone: "neutral" },
}

const SUPPORT_TONE: Record<StrategyRetrievalView["support"], string> = {
  suficiente: "border-success/25 bg-success-soft/50 text-success",
  parcial: "border-warning/25 bg-warning-soft/50 text-warning",
  insuficiente: "border-border bg-surface-muted text-muted-foreground",
}

/**
 * Análise comparativa: a pergunta do advogado + o processo contra os precedentes REAIS da
 * base. A identificação, a posição lida na ementa, o resultado e os trechos vêm da Íntegra
 * (calculados, com o texto da base); a IA só interpreta e propõe estratégias, citando
 * apenas essas decisões. Nada roda ao abrir o processo.
 */
export function ComparativeAnalysis({ process, onOpen }: { process: Process; onOpen: (decisionId: string) => void }) {
  const { status, ready } = useLexaAI()
  const [question, setQuestion] = React.useState("")
  const analysis = useAIAction<JurisprudenceStrategyResult>()
  const run = () => analysis.run((signal) => aiApi.jurisprudenceStrategy({ question: question.trim() || DEFAULT_QUESTION, processId: process.id }, signal))
  const result = analysis.data
  const openSource = (source: AISource) => source.id && onOpen(source.id)

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
          <Scale className="size-4 text-brand-strong" /> Análise comparativa com precedentes
        </p>
        <p className="text-[12px] text-muted-foreground">
          Descreva a questão, os fatos e o que o cliente pretende. A Íntegra pesquisa a base por questão jurídica, compara cada precedente com o caso e aponta teses,
          contrários, riscos e lacunas — só com decisões recuperadas da base.
        </p>
      </div>
      <TextArea
        value={question}
        onChange={(e) => setQuestion(e.target.value.slice(0, 2000))}
        placeholder="Ex.: Cabe dano moral? O cliente nunca contratou o empréstimo e teve o nome negativado; temos o boletim de ocorrência."
        aria-label="Pergunta ou tese a avaliar"
        className="min-h-[76px] text-[13px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        {!(status && !ready) && (
          <Button size="sm" variant="secondary" onClick={run} disabled={!ready || analysis.loading}>
            <Sparkles /> {result ? "Analisar de novo" : "Analisar com precedentes"}
          </Button>
        )}
        <span className="text-[11.5px] text-subtle">Sem pergunta, a análise parte do assunto, do tipo de ação e das observações do processo.</span>
      </div>
      {status && !ready && <AIUnavailable status={status} />}
      {analysis.error && <AIErrorNotice error={analysis.error} onRetry={run} />}
      {analysis.loading && <AIThinking label="Pesquisando por questão jurídica e comparando com o caso…" onCancel={analysis.cancel} />}
      {result && !analysis.loading && <StrategyView result={result} onOpen={onOpen} onOpenSource={openSource} />}
    </div>
  )
}

function StrategyView({ result, onOpen, onOpenSource }: { result: JurisprudenceStrategyResult; onOpen: (id: string) => void; onOpenSource: (s: AISource) => void }) {
  const { data, sources, retrieval } = result
  const byRef = new Map(data.precedentes.map((p) => [p.ref, p]))
  const text = (value: string) => <AIText text={value} sources={sources} onOpen={onOpenSource} />
  return (
    <div className="ai-surface space-y-4 rounded-[12px] border border-border/80 p-3.5">
      <p className={cn("rounded-[10px] border px-3 py-2 text-[12.5px] leading-snug", SUPPORT_TONE[retrieval.support])}>{retrieval.message}</p>

      {data.sintese && retrieval.precedentes.length > 0 && (
        <AISection title="1. O problema jurídico">
          <p className="text-[13px] leading-relaxed">{text(data.sintese)}</p>
        </AISection>
      )}
      {retrieval.caso.questoes.length > 0 && (
        <AISection title="Questões identificadas">
          <ul className="space-y-1.5">
            {retrieval.caso.questoes.map((q, i) => (
              <li key={i} className="text-[13px]">
                <span className="font-medium">{q.questao}</span>
                {q.ampla && <span className="ml-1 text-[12px] text-warning">(ampla demais para indicar precedente aplicável)</span>}
                {q.roteiro.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-3 text-[12px] text-muted-foreground">
                    {q.roteiro.map((r, j) => (
                      <li key={j}>
                        {r.texto}: <span className={r.situacao === "não informado" ? "text-warning" : "text-foreground"}>{r.situacao}</span>
                        {r.detalhe ? ` — ${r.detalhe}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-subtle">O roteiro de verificação é da Íntegra (o que costuma ser examinado) — não é conteúdo das decisões.</p>
        </AISection>
      )}

      {retrieval.precedentes.length > 0 && (
        <AISection title="2–3. Precedentes e comparação com o caso">
          <ul className="space-y-2.5">
            {retrieval.precedentes.map((p) => (
              <PrecedentCard key={p.id} precedent={p} ai={byRef.get(p.ref)} onOpen={onOpen} text={text} />
            ))}
          </ul>
        </AISection>
      )}

      {data.teses_favoraveis.length > 0 && (
        <AISection title="4. Teses potencialmente favoráveis">
          <ul className="space-y-2.5">
            {data.teses_favoraveis.map((t, i) => (
              <li key={i} className="rounded-[10px] border border-border bg-surface p-3 text-[13px]">
                <p className="font-medium">
                  {text(t.tese)} {t.refs.map((r) => text(`[${r}]`))}
                </p>
                <p className="mt-1 leading-relaxed text-muted-foreground">{text(t.justificativa)}</p>
                <Mini title="Requisitos a demonstrar" items={t.requisitos} />
                <Mini title="Elementos do caso" items={t.elementos_do_caso} />
                <Mini title="Distinções" items={t.distincoes} />
                <Mini title="Riscos" items={t.riscos} />
                <Mini title="Informações necessárias" items={t.informacoes_necessarias} />
              </li>
            ))}
          </ul>
        </AISection>
      )}

      {data.contrarios_e_distincoes.length > 0 && (
        <AISection title="5. Precedentes contrários e possíveis distinções">
          <ul className="space-y-2">
            {data.contrarios_e_distincoes.map((c, i) => (
              <li key={i} className="text-[13px] leading-relaxed">
                {text(`[${c.ref}]`)} {text(c.fundamento_contrario)}
                {c.distincao_possivel && <span className="block text-muted-foreground">Distinção possível: {text(c.distincao_possivel)}</span>}
                {c.como_demonstrar && <span className="block text-muted-foreground">O que demonstrar: {text(c.como_demonstrar)}</span>}
              </li>
            ))}
          </ul>
        </AISection>
      )}

      {(data.riscos.length > 0 || data.lacunas_probatorias.length > 0) && (
        <AISection title="6. Riscos e lacunas de prova">
          <AIList items={data.riscos.map((r) => `${r.texto} ${r.refs.map((x) => `[${x}]`).join(" ")}`.trim())} sources={sources} onOpen={onOpenSource} />
          {data.lacunas_probatorias.length > 0 && (
            <ul className="mt-2 space-y-1">
              {data.lacunas_probatorias.map((l, i) => (
                <li key={i} className="text-[12.5px]">
                  <span className="font-medium">{l.fato}</span> —{" "}
                  <span className={l.situacao === "informado" || l.situacao === "prova mencionada" ? "text-foreground" : "text-warning"}>{l.situacao}</span>
                  {l.observacao && <span className="text-muted-foreground">: {l.observacao}</span>}
                </li>
              ))}
            </ul>
          )}
        </AISection>
      )}

      {data.cenarios.length > 0 && (
        <AISection title="Cenários condicionais">
          <AIList items={data.cenarios.map((c) => `Se ${c.se}, então ${c.entao} ${c.refs.map((x) => `[${x}]`).join(" ")}`.trim())} sources={sources} onOpen={onOpenSource} />
        </AISection>
      )}

      {(data.proximos_pontos.length > 0 || retrieval.caso.lacunas.length > 0) && (
        <AISection title="7. Próximos pontos a avaliar">
          <AIList items={data.proximos_pontos} sources={sources} onOpen={onOpenSource} />
          {retrieval.caso.lacunas.length > 0 && (
            <div className="mt-2">
              <p className="text-[11.5px] font-medium text-muted-foreground">Informações que faltam no caso</p>
              <AIList items={[...new Set([...retrieval.caso.lacunas, ...data.informacoes_ausentes])]} />
            </div>
          )}
        </AISection>
      )}

      <details className="group rounded-[10px] border border-border px-3 py-2 text-[12px]">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-muted-foreground">
          Como a pesquisa foi feita
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-2 space-y-1">
          {retrieval.consultas.map((q, i) => (
            <li key={i} className="text-muted-foreground">
              <span className="text-foreground">{q.tipo}</span> · {q.conceitos.join(" + ")} — {q.situacao}, {q.resultados} resultado(s)
            </li>
          ))}
        </ul>
        <p className="mt-2 text-subtle">
          {retrieval.metricas.unicas} decisões avaliadas ({retrieval.metricas.duplicatas} duplicata(s) removida(s)) · {retrieval.metricas.pertinentes} pertinentes ·{" "}
          {retrieval.metricas.selecionadas} analisadas, {retrieval.metricas.aplicaveis} aplicáveis e {retrieval.metricas.contrarias} contrária(s) · {(retrieval.metricas.ms / 1000).toFixed(1)} s
        </p>
      </details>

      <AIFooter result={result} />
    </div>
  )
}

function Mini({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="mt-1.5">
      <p className="text-[11.5px] font-medium text-muted-foreground">{title}</p>
      <AIList items={items} />
    </div>
  )
}

function Excerpt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="mt-1.5 border-l-2 border-brand/40 pl-2.5">
      <figcaption className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Quote className="size-3" /> {label}
      </figcaption>
      <blockquote className="text-[12.5px] italic leading-relaxed">{children}</blockquote>
    </figure>
  )
}

function PrecedentCard({
  precedent: p,
  ai,
  onOpen,
  text,
}: {
  precedent: Precedent
  ai?: JurisprudenceStrategyResult["data"]["precedentes"][number]
  onOpen: (id: string) => void
  text: (value: string) => React.ReactNode
}) {
  const meta = [p.orgao, p.relator, p.dataJulgamento ? `julgado em ${fmtNumericDate(p.dataJulgamento)}` : undefined, p.publicacao ? `publicação: ${/^\d{4}-\d{2}-\d{2}$/.test(p.publicacao) ? fmtNumericDate(p.publicacao) : p.publicacao}` : undefined]
    .filter(Boolean)
    .join(" · ")
  const stance = p.posicaoCliente !== "indeterminada" ? STANCE[p.posicaoCliente] : THESIS[p.posicao]
  return (
    <li className="rounded-[10px] border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen(p.id)} className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <span className="font-mono text-[11px] text-brand-strong">{p.ref}</span> <span className="text-[13px] font-medium hover:underline">{p.label}</span>
          {meta && <span className="block text-[11.5px] text-muted-foreground">{meta}</span>}
        </button>
        <span className="flex flex-wrap gap-1">
          <StatusBadge tone={p.nivel === "aplicavel" ? "success" : "neutral"} size="sm" dot={false}>
            {p.nivel === "aplicavel" ? "Aplicável à questão" : "Relacionada"}
          </StatusBadge>
          <StatusBadge tone={stance.tone} size="sm" dot={false}>
            {stance.label}
          </StatusBadge>
        </span>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">Questão: {p.questao}</p>
      {p.resultado ? <p className="text-[12px]">Resultado (como escrito): {p.resultado}</p> : <p className="text-[12px] text-subtle">Resultado do julgamento não identificado no texto da base.</p>}
      {p.trechoPosicao && <Excerpt label="Trecho literal que indica a posição">{p.trechoPosicao}</Excerpt>}
      {p.ressalva && <p className="mt-1 text-[12px] text-warning">Ressalva na ementa: {p.ressalva}</p>}
      {!p.trechoPosicao && p.trecho && <Excerpt label={`Trecho literal (${p.trecho.campo})`}>{p.trecho.texto}{p.trecho.cortado ? " […]" : ""}</Excerpt>}
      {p.fatosEmComum.length > 0 && <p className="mt-1.5 text-[12px]">Fatos em comum: {p.fatosEmComum.join("; ")}</p>}
      {p.distincoes.length > 0 && (
        <div className="mt-1.5 text-[12px]">
          <p className="font-medium text-muted-foreground">Distinções detectadas</p>
          <AIList items={p.distincoes} />
        </div>
      )}
      {p.metadadosAusentes.length > 0 && <p className="mt-1 text-[11.5px] text-subtle">Não consta na base: {p.metadadosAusentes.join(", ")}.</p>}
      {ai && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-[12.5px]">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Leitura da IA</p>
          {ai.por_que_importa && <p className="leading-relaxed">{text(ai.por_que_importa)}</p>}
          <Mini title="Semelhanças materiais" items={ai.semelhancas} />
          <Mini title="Distinções relevantes" items={ai.distincoes} />
          {ai.compatibilidade && <p className="leading-relaxed text-muted-foreground">Compatibilidade: {text(ai.compatibilidade)}</p>}
          <Mini title="Limitações" items={ai.limitacoes} />
          {ai.trechos.map((t, i) =>
            t.tipo === "literal" ? (
              <Excerpt key={i} label="Transcrição literal (conferida com a base)">
                {t.texto}
              </Excerpt>
            ) : (
              <p key={i} className="mt-1 text-[12.5px] text-muted-foreground">
                <span className="font-medium">Paráfrase da IA:</span> {t.texto}
                {t.nota && <span className="block text-[11.5px] text-warning">{t.nota}</span>}
              </p>
            ),
          )}
        </div>
      )}
    </li>
  )
}
