/**
 * Formato de cada resposta estruturada da Íntegra IA. O mesmo objeto gera o JSON
 * Schema enviado ao modelo e valida o que volta antes de chegar à tela.
 */

import { array, object, oneOf, string, type Schema } from "@/lib/ai/schema"
import type {
  ActionSuggestion,
  AttentionPoint,
  ClientSummary,
  EnrichmentSummary,
  FinanceAnalysis,
  JurisprudenceAnalysis,
  JurisprudenceStrategy,
  RelatedJurisprudenceAnalysis,
  MovementAnalysis,
  NextActions,
  OfficeOverview,
  ProcessSummary,
  ReferencedNote,
} from "@/lib/ai/types"

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

const actionSuggestionSchema: Schema<ActionSuggestion> = object({
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

export const financeAnalysisSchema: Schema<FinanceAnalysis> = object({
  leitura: string({ max: 900, min: 1 }),
  pontos_atencao: array(attentionPoint, { max: 6 }),
  sugestoes: texts("Próximos passos práticos, sem números novos.", 5),
  perguntas_para_verificar: texts("Perguntas para o advogado conferir.", 4),
})

export const jurisprudenceAnalysisSchema: Schema<JurisprudenceAnalysis> = object({
  resumo: string({ max: 1200, min: 1 }),
  tese_principal: text("A tese como está na decisão; vazio se não constar.", 900),
  resultado: text("Resultado do julgamento como consta do texto; vazio se não constar.", 600),
  pontos_relevantes: texts("Pontos da própria decisão.", 6),
  fundamentos_mencionados: texts("Somente dispositivos, súmulas ou precedentes que aparecem no texto da decisão.", 8),
  relevancia_para_pesquisa: text(undefined, 700),
  comparacao_com_processo: text("Vazio quando nenhum processo foi informado.", 900),
  informacoes_ausentes: texts("O que a decisão não informa.", 6),
})

export const enrichmentSummarySchema: Schema<EnrichmentSummary> = object({
  resumo: string({ max: 900, min: 1, description: "2 a 4 frases sobre o que a consulta encontrou." }),
  fatos_confirmados: array(object({ texto: text(undefined, 400), refs }), {
    description: "Só o que está nos dados, cada um com a referência da fonte (Q1, Q2, J1…).",
    max: 10,
  }),
  inferencias: array(object({ texto: text(undefined, 400), refs }), {
    description: "Leituras possíveis a partir dos dados, sempre apresentadas como possibilidade.",
    max: 5,
  }),
  ausentes: texts("Informações que nenhuma fonte trouxe.", 12),
  cuidados: texts("Limites da consulta.", 4),
})

export const relatedJurisprudenceSchema: Schema<RelatedJurisprudenceAnalysis> = object({
  visao_geral: string({ max: 900, min: 1 }),
  decisoes: array(
    object({
      ref: string({ max: 12, min: 1, description: "Referência existente nos dados, ex.: J1." }),
      semelhanca: oneOf(["alta", "media", "baixa"] as const),
      motivo: text(undefined, 400),
    }),
    { max: 12 },
  ),
  cuidados: texts("Limites da comparação.", 4),
})

const jRefs = array(string({ max: 12 }), { description: "Referências das decisões nos dados (J1, J2…) que sustentam o item.", max: 6 })

export const jurisprudenceStrategySchema: Schema<JurisprudenceStrategy> = object({
  sintese: string({ max: 1200, min: 1, description: "Síntese do problema jurídico: as questões a decidir e o que os dados do caso mostram." }),
  precedentes: array(
    object({
      ref: string({ max: 12, min: 1, description: "Referência existente nos dados, ex.: J1." }),
      por_que_importa: text("Por que esta decisão importa para a questão do caso.", 600),
      semelhancas: texts("Semelhanças MATERIAIS (fatos e circunstâncias) entre o caso e o precedente.", 5),
      distincoes: texts("Diferenças factuais, processuais ou jurídicas que podem alterar a aplicação.", 5),
      compatibilidade: text("Por que o fundamento pode (ou não) ser útil ao caso.", 600),
      limitacoes: texts("O que impede a aplicação direta ou reduz a força do precedente.", 4),
      trechos: array(
        object({
          texto: text("Trecho da decisão usado na análise.", 600),
          tipo: oneOf(["literal", "parafrase"] as const, { description: "literal = copiado exatamente da ementa/tese/trecho; parafrase = suas palavras." }),
        }),
        { max: 3 },
      ),
    }),
    { max: 8 },
  ),
  teses_favoraveis: array(
    object({
      tese: text(undefined, 400),
      justificativa: text(undefined, 700),
      requisitos: texts("O que precisa ser demonstrado.", 5),
      elementos_do_caso: texts("Elementos do caso que sustentam a tese (só o que está nos dados).", 5),
      refs: jRefs,
      distincoes: texts("Distinções relevantes que podem enfraquecer a tese.", 4),
      riscos: texts("Riscos da tese.", 4),
      informacoes_necessarias: texts("Informações ainda necessárias.", 4),
    }),
    { max: 4 },
  ),
  contrarios_e_distincoes: array(
    object({
      ref: string({ max: 12, min: 1 }),
      fundamento_contrario: text(undefined, 500),
      distincao_possivel: text("Diferença demonstrável que justificaria tratamento distinto; vazio se não houver.", 500),
      como_demonstrar: text("O que seria preciso demonstrar; vazio se não houver distinção.", 400),
    }),
    { max: 4 },
  ),
  riscos: array(object({ texto: text(undefined, 500), refs: jRefs }), { max: 6 }),
  lacunas_probatorias: array(
    object({
      fato: text(undefined, 300),
      situacao: oneOf(["informado", "prova mencionada", "sem prova informada", "contraditorio"] as const),
      observacao: text(undefined, 400),
    }),
    { max: 8 },
  ),
  cenarios: array(object({ se: text(undefined, 300), entao: text(undefined, 400), refs: jRefs }), { max: 4 }),
  proximos_pontos: texts("O que o advogado deve avaliar a seguir.", 6),
  informacoes_ausentes: texts("O que falta nos dados para uma conclusão segura.", 8),
})
