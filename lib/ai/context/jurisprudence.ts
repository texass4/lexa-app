/**
 * Contexto da Análise da Íntegra sobre jurisprudência. Só vai ao modelo o que está na
 * base (campos da decisão, já normalizados e limpos) e, quando pedido, o resumo do
 * processo do escritório. Campos ausentes são listados como ausentes — o modelo é
 * instruído a não completá-los.
 */

import { PROCESS_STATUS } from "@/lib/core/config"
import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import type { Process } from "@/types"
import { type BuiltContext, SourceRegistry, fmtDate, fmtDateTime, fmtToday } from "./shared"

const LIMITS = { decisionText: 12_000, cited: 3_000, relatedEmenta: 2_500, movements: 5 } as const

const cut = (text: string | undefined, max: number) => (text && text.length > max ? `${text.slice(0, max)}… [texto cortado]` : text)

export const decisionLabel = (d: Pick<JurisprudenceDecision, "tribunal" | "classCode" | "processNumber">) =>
  [d.tribunal, [d.classCode, d.processNumber].filter(Boolean).join(" ")].filter(Boolean).join(" · ")

function registerDecision(registry: SourceRegistry, decision: JurisprudenceDecision) {
  return registry.add("jurisprudence", {
    id: decision.id,
    label: decisionLabel(decision),
    date: decision.judgmentDate,
    href: `/jurisprudencia?id=${decision.id}`,
  })
}

function describeProcess(registry: SourceRegistry, process: Process) {
  const ref = registry.add("process", { id: process.id, label: `Processo ${process.number}`, date: process.lastMovementAt, href: `/processos/${process.id}` })
  return {
    ref,
    numero: process.number,
    tipo_de_acao: process.type,
    classe: process.className,
    assunto: process.subject,
    area: process.area,
    tribunal: process.tribunal,
    orgao_julgador: process.judicialUnit ?? process.court,
    situacao: PROCESS_STATUS[process.status]?.label,
    ultimas_movimentacoes: [...(process.movements ?? [])]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, LIMITS.movements)
      .map((m) => `${fmtDateTime(m.at)} — ${m.title}`),
  }
}

const FIELD_LABEL: [keyof JurisprudenceDecision, string][] = [
  ["processNumber", "número do processo"],
  ["rapporteur", "relator"],
  ["court", "órgão julgador"],
  ["judgmentDate", "data do julgamento"],
  ["decisionText", "texto da decisão (dispositivo)"],
  ["thesis", "tese jurídica destacada"],
]

export function buildDecisionContext(decision: JurisprudenceDecision, options: { now: Date; query?: string; process?: Process | null }): BuiltContext {
  const registry = new SourceRegistry()
  const ref = registerDecision(registry, decision)
  const context = {
    data_de_hoje: fmtToday(options.now),
    fonte: `${decision.sourceLabel} (dado oficial)`,
    decisao: {
      ref,
      tribunal: decision.tribunal,
      orgao_julgador: decision.court,
      classe: [decision.classCode, decision.className].filter(Boolean).join(" — ") || undefined,
      numero_do_processo: decision.processNumber,
      numero_de_registro: decision.registryNumber,
      relator: decision.rapporteur,
      data_do_julgamento: fmtDate(decision.judgmentDate),
      publicacao: decision.publication,
      tipo: decision.decisionType,
      assunto: decision.subject,
      ementa: decision.ementa,
      decisao: cut(decision.decisionText, LIMITS.decisionText),
      tese_juridica: decision.thesis,
      referencias_legislativas: decision.legislation.length ? decision.legislation : undefined,
      jurisprudencia_citada: cut(decision.citedPrecedents, LIMITS.cited),
      notas: decision.notes,
    },
    pesquisa_do_advogado: options.query?.trim() || undefined,
    processo_do_escritorio: options.process ? describeProcess(registry, options.process) : undefined,
    campos_ausentes: FIELD_LABEL.filter(([key]) => !decision[key]).map(([, label]) => label),
  }
  return { context, sources: registry.sources, basis: `Baseado na decisão como publicada: ${decision.sourceLabel}.` }
}

export function buildRelatedContext(process: Process, decisions: JurisprudenceDecision[], now: Date): BuiltContext {
  const registry = new SourceRegistry()
  const context = {
    data_de_hoje: fmtToday(now),
    processo_do_escritorio: describeProcess(registry, process),
    decisoes: decisions.map((d) => ({
      ref: registerDecision(registry, d),
      tribunal: d.tribunal,
      orgao_julgador: d.court,
      classe: d.classCode,
      numero_do_processo: d.processNumber,
      data_do_julgamento: fmtDate(d.judgmentDate),
      assunto: d.subject,
      ementa: cut(d.ementa, LIMITS.relatedEmenta),
      tese_juridica: d.thesis,
    })),
  }
  return { context, sources: registry.sources, basis: "Baseado nas decisões encontradas na base oficial e nos dados do processo." }
}
