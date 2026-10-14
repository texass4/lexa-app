/**
 * Contexto da análise comparativa de jurisprudência (conversa e "Análise comparativa").
 *
 * Vai ao modelo só o que a Íntegra recuperou e conferiu: o caso estruturado (com a
 * origem de cada fato), as consultas executadas e, para cada precedente REAL da base,
 * a identificação como está nos dados, a ementa, o resultado e a posição lidos no
 * texto (com o trecho literal) e a comparação com o caso. O que falta é dito como falta.
 * Nunca a base inteira: no máximo `PIPELINE.maxSelected` decisões.
 */

import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import type { CaseAnalysis } from "@/lib/ai/jurisprudence-case"
import type { PrecedentComparison, RetrievalResult } from "@/lib/ai/jurisprudence-pipeline"
import { type SourceRegistry, fmtDate } from "./shared"

const EMENTA_CHARS = 2_500
const cut = (text: string | undefined, max: number) => (text && text.length > max ? `${text.slice(0, max)}… [texto cortado]` : text)

export const BASE_NOTE =
  "Somente decisões indexadas pela Íntegra a partir de fontes oficiais (hoje: STJ — Portal de Dados Abertos, acórdãos selecionados). Não reúne todos os tribunais; não registra reforma, superação ou decisões posteriores."

export const decisionLabel = (d: Pick<JurisprudenceDecision, "tribunal" | "classCode" | "processNumber">) =>
  [d.tribunal, [d.classCode, d.processNumber].filter(Boolean).join(" ")].filter(Boolean).join(" · ")

export function registerDecision(registry: SourceRegistry, decision: JurisprudenceDecision) {
  return registry.add("jurisprudence", {
    id: decision.id,
    label: decisionLabel(decision),
    date: decision.judgmentDate,
    href: `/jurisprudencia?id=${decision.id}`,
  })
}

const STANCE_LABEL = { acolhe: "acolhe a tese da questão", rejeita: "rejeita a tese da questão", indeterminada: "não identificada automaticamente — leia a ementa" } as const
const CLIENT_LABEL = { favoravel: "favorável ao cliente", contraria: "contrária ao cliente", indeterminada: "não identificada" } as const

/** Um precedente como o modelo o recebe: dados como estão + comparação feita pela Íntegra. */
export function describePrecedent(registry: SourceRegistry, refs: Map<string, string>, p: PrecedentComparison, analysis: CaseAnalysis, { full }: { full: boolean }) {
  const d = p.decision
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
    publicacao: d.publication ?? fmtDate(d.publicationDate),
    assunto: d.subject,
    ementa: cut(d.ementa, full ? EMENTA_CHARS : 1_500),
    tese_juridica: d.thesis,
    fonte: d.sourceLabel,
    questao: p.issueQuestion,
    pertinencia: p.level === "aplicavel" ? "diretamente pertinente" : "relacionada — insuficiente para sustentar conclusão sozinha",
    posicao_quanto_a_tese: STANCE_LABEL[p.stance],
    posicao_para_o_cliente: analysis.position === "nao_informada" ? undefined : CLIENT_LABEL[p.stanceForClient],
    trecho_da_posicao: p.stanceEvidence?.sentence,
    ressalva_na_ementa: p.stanceEvidence?.exception,
    resultado_do_julgamento: p.outcome ?? "não identificado no texto da base",
    fatos_em_comum_com_o_caso: p.sharedFacts.map((f) => f.label),
    distincoes_detectadas: p.distinctions.map((x) => x.text),
    metadados_ausentes: p.missingMetadata.length ? p.missingMetadata : undefined,
    vigencia: "não verificada: a base não registra reforma, superação ou entendimento posterior",
    pontuacao_interna: p.score,
    trecho_literal: p.lexical.excerpt
      ? { campo: p.lexical.excerpt.field, texto: p.lexical.excerpt.cut ? `${p.lexical.excerpt.text} […]` : p.lexical.excerpt.text }
      : "Nenhum trecho localizado automaticamente: leia a ementa.",
  }
}

/** O caso, como o modelo o recebe. `withProcessData`: falso = só o que veio da pergunta. */
export function describeCase(analysis: CaseAnalysis, { withProcessData }: { withProcessData: boolean }) {
  const allowed = <T extends { source: string }>(list: T[]) => list.filter((x) => withProcessData || x.source === "pergunta")
  return {
    profundidade: analysis.depth === "completa" ? "análise do caso (estruturada)" : "pergunta direta (resposta curta)",
    questoes: analysis.issues.map((i) => ({
      questao: i.question,
      tese_da_questao: i.thesis,
      ampla_demais: i.vague || undefined,
      roteiro_de_verificacao: i.requirements.length
        ? i.requirements.map((r) => ({ requisito: r.text, situacao_nos_dados: r.status, detalhe: withProcessData || r.status === "não informado" ? r.detail : undefined }))
        : undefined,
    })),
    area: withProcessData ? analysis.area : undefined,
    tipo_de_acao: withProcessData ? analysis.actionType : undefined,
    assunto: withProcessData ? analysis.subject : undefined,
    fase: analysis.phase && (withProcessData || analysis.phase.source === "pergunta") ? analysis.phase.text : undefined,
    tribunal_do_processo: withProcessData && analysis.tribunal ? [analysis.tribunal.tribunal, analysis.tribunal.degree, analysis.tribunal.unit].filter(Boolean).join(" · ") : undefined,
    posicao_do_cliente: { autor: "autor (quem pede)", reu: "réu (quem se defende)", nao_informada: "não informada" }[analysis.position],
    resultado_pretendido: analysis.desiredOutcome,
    fatos_informados: allowed(analysis.facts).map((f) => ({ fato: f.label, origem: f.source, trecho: f.quote })),
    provas: allowed(analysis.evidence).map((e) => ({ prova: e.label, situacao: e.status === "ausente" ? "dita como ausente" : "mencionada (não é prova produzida)", origem: e.source })),
    onus_da_prova: analysis.burden.length ? analysis.burden : undefined,
    lacunas: analysis.gaps,
  }
}

/** Uma frase sobre o resultado, para o modelo não confundir "não achou" com "não existe". */
export function retrievalOutcome(result: RetrievalResult) {
  if (result.status === "indisponivel") return "A pesquisa de jurisprudência falhou (erro técnico). Isso NÃO é ausência de decisões: diga que a base não respondeu e que vale tentar de novo."
  if (result.status === "cancelada") return "A pesquisa foi interrompida antes de terminar."
  if (result.status === "nao_executada") return `A pesquisa não foi feita: ${result.notRun ?? "faltou o tema."}`
  if (result.support === "suficiente") return "Há decisões diretamente pertinentes a cada questão identificada entre as encontradas."
  if (result.support === "parcial") return "Há decisões diretamente pertinentes a parte das questões; para as demais a pesquisa NÃO encontrou suporte suficiente — diga isso."
  if (result.precedents.length)
    return "A pesquisa NÃO encontrou decisão diretamente pertinente; só decisões relacionadas, que não bastam para sustentar uma conclusão sobre a pergunta. Diga isso."
  return "A pesquisa NÃO encontrou decisão pertinente para estes termos. Isso não significa que a base não tenha decisões sobre o assunto (podem usar outras palavras), nem que o tema não tenha jurisprudência fora da base."
}

export function describeQueries(result: RetrievalResult) {
  const kind = { principal: "principal", alternativa: "alternativa (termos equivalentes)", contrarios: "busca de decisões contrárias" } as const
  const status = { ok: "executada", erro: "falhou", tempo_esgotado: "tempo esgotado", cancelada: "cancelada", pulada: "não executada (limite)" } as const
  return result.queries.map((q) => ({ questao: q.issue, tipo: kind[q.kind], conceitos: q.concepts, resultados: q.results, situacao: status[q.status] }))
}
