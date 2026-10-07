/**
 * Contexto da Análise da Íntegra sobre jurisprudência. Só vai ao modelo o que está na
 * base (campos da decisão, já normalizados e limpos) e, quando pedido, o resumo do
 * processo do escritório. Campos ausentes são listados como ausentes — o modelo é
 * instruído a não completá-los.
 */

import { PROCESS_STATUS } from "@/lib/core/config"
import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import type { Process } from "@/types"
import type { AISources } from "@/lib/ai/types"
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

/* --------------------------------- conversa -------------------------------- */

export interface ChatJurisprudence {
  /** Pesquisa feita na base para esta pergunta (ou por que não foi possível). */
  search?: { query: string; total: number; decisions: JurisprudenceDecision[] } | { unavailable: string }
  /** Vinculadas ao processo da conversa. */
  linked?: JurisprudenceDecision[]
  /** Salvas pelo escritório. */
  saved?: JurisprudenceDecision[]
}

const CHAT_EMENTA = 1_500

/**
 * Bloco de jurisprudência para a conversa: só decisões reais da base, cada uma com uma
 * referência [J1]… que vira link para a decisão. A mesma decisão em duas listas tem a
 * mesma referência. Vem com as próprias fontes (prefixo J, sem colisão com o resto).
 */
export function jurisprudenceChatSection(input: ChatJurisprudence): { context: Record<string, unknown>; sources: AISources } {
  const registry = new SourceRegistry()
  const refs = new Map<string, string>()
  const describe = (d: JurisprudenceDecision) => {
    let ref = refs.get(d.id)
    if (!ref) {
      ref = registerDecision(registry, d)
      refs.set(d.id, ref)
    }
    return {
      ref,
      tribunal: d.tribunal,
      orgao_julgador: d.court,
      processo: [d.classCode, d.processNumber].filter(Boolean).join(" ") || undefined,
      relator: d.rapporteur,
      data_do_julgamento: fmtDate(d.judgmentDate),
      assunto: d.subject,
      ementa: cut(d.ementa, CHAT_EMENTA),
      tese_juridica: d.thesis,
      fonte: d.sourceLabel,
    }
  }
  const context: Record<string, unknown> = {}
  if (input.linked?.length) context.jurisprudencia_vinculada_ao_processo = input.linked.map(describe)
  if (input.saved?.length) context.jurisprudencia_salva_pelo_escritorio = input.saved.map(describe)
  if (input.search) {
    context.pesquisa_de_jurisprudencia =
      "unavailable" in input.search
        ? { situacao: input.search.unavailable }
        : {
            termos_pesquisados: input.search.query,
            total_na_base: input.search.total,
            base: "Somente decisões indexadas pela Íntegra a partir de fontes oficiais (hoje: STJ — Portal de Dados Abertos).",
            decisoes: input.search.decisions.map(describe),
          }
  }
  return { context, sources: registry.sources }
}
