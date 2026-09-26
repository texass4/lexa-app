/**
 * Formato de cada resposta estruturada da LEXA IA. O mesmo objeto gera o JSON
 * Schema enviado ao modelo e valida o que volta antes de chegar à tela.
 */

import { array, object, oneOf, string, type Schema } from "@/lib/ai/schema"
import type { ActionSuggestion, AttentionPoint, ClientSummary, MovementAnalysis, NextActions, OfficeOverview, ProcessSummary, ReferencedNote } from "@/lib/ai/types"

const text = (description?: string, max?: number) => string({ description, max })
const texts = (description: string, max = 8) => array(string({ max: 500 }), { description, max })
const refs = array(string({ max: 12 }), { description: "Referências das fontes nos dados, ex.: M3, T1.", max: 8 })
const confidence = oneOf(["alto", "medio", "baixo"] as const, { description: "Quanto os dados sustentam a análise." })

const attentionPoint: Schema<AttentionPoint> = object({
  texto: text(undefined, 500),
  natureza: oneOf(["fato", "inferencia", "verificacao"] as const, {
    description: "fato = registrado nos dados; inferencia = possibilidade; verificacao = algo a conferir.",
  }),
  refs,
})

const referencedNote: Schema<ReferencedNote> = object({
  ref: string({ max: 12, min: 1, description: "Referência existente nos dados, ex.: M2 ou P1." }),
  comentario: text(undefined, 400),
})

export const actionSuggestionSchema: Schema<ActionSuggestion> = object({
  titulo: string({ max: 90, min: 3 }),
  descricao: text(undefined, 600),
  prioridade: oneOf(["alta", "media", "baixa"] as const),
  justificativa: text(undefined, 400),
  refs,
})

export const processSummarySchema: Schema<ProcessSummary> = object({
  resumo: string({ max: 1200, min: 1 }),
  situacao: text(undefined, 800),
  fatos_relevantes: texts("Fatos objetivos registrados."),
  movimentacoes_relevantes: array(referencedNote, { max: 6 }),
  pontos_atencao: array(attentionPoint, { max: 8 }),
  proximas_acoes: texts("Sugestões, não obrigações.", 6),
  informacoes_ausentes: texts("O que falta nos dados.", 6),
  nivel_confianca: confidence,
})

export const movementAnalysisSchema: Schema<MovementAnalysis> = object({
  o_que_aconteceu: string({ max: 1000, min: 1 }),
  o_que_o_registro_informa: texts("Somente o que está no registro.", 6),
  o_que_nao_e_possivel_concluir: texts("Limites do registro.", 6),
  pontos_atencao: texts("Pontos que podem merecer verificação.", 5),
  sugestoes_tarefa: array(actionSuggestionSchema, { max: 1, description: "Zero ou uma tarefa sugerida." }),
  nivel_confianca: confidence,
})

export const nextActionsSchema: Schema<NextActions> = object({
  pontos_atencao: array(attentionPoint, { max: 8 }),
  sugestoes: array(actionSuggestionSchema, { max: 4 }),
  informacoes_ausentes: texts("O que falta nos dados.", 5),
})

export const clientSummarySchema: Schema<ClientSummary> = object({
  resumo: string({ max: 1200, min: 1 }),
  processos: array(referencedNote, { max: 10 }),
  pontos_atencao: array(attentionPoint, { max: 8 }),
  atividades_recentes: texts("Atividades registradas.", 6),
  pendencias: texts("Pendências registradas.", 8),
  proximas_acoes: texts("Sugestões, não obrigações.", 6),
  informacoes_ausentes: texts("O que falta nos dados.", 5),
  nivel_confianca: confidence,
})

export const officeOverviewSchema: Schema<OfficeOverview> = object({
  visao_geral: string({ max: 1200, min: 1 }),
  pontos_atencao: array(attentionPoint, { max: 8 }),
  processos_para_analise: array(referencedNote, { max: 6 }),
  pendencias: texts("Pendências registradas.", 8),
  tarefas_atrasadas: text(undefined, 800),
  situacao_financeira: text(undefined, 800),
  sugestoes_organizacao: texts("Sugestões práticas.", 6),
  perguntas_para_verificar: texts("Perguntas para o advogado.", 6),
})
