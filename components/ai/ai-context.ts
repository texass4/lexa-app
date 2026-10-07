/**
 * O que a Íntegra IA oferece em cada tela. Quanto mais contexto a tela tem, mais
 * específica é a pergunta:
 *
 *   Painel     → "Como está meu escritório?"
 *   Cliente    → "Como está este cliente?"
 *   Processo   → "O que está acontecendo neste processo?"
 *   Tarefa     → "O que preciso fazer?"
 *   Agenda     → "O que tenho para fazer?"
 *
 * Só texto: as perguntas vão para as rotas `/api/ai/*` por clique, nunca sozinhas.
 */

import type { ChatScope } from "@/lib/ai/types"

export interface AIContext {
  scope: ChatScope
  /** Linha abaixo de "Íntegra IA" no painel ("Processo 0001", "Ana Souza"). */
  subtitle: string
  /** Pergunta que resume a tela — o convite no painel vazio. */
  headline: string
  prompts: string[]
}

export const OFFICE_PROMPTS = [
  "O que merece minha atenção?",
  "O que mudou recentemente?",
  "Quais processos estão parados?",
  "Quais tarefas estão atrasadas?",
  "Faça um panorama do escritório.",
]

export const PROCESS_PROMPTS = [
  "Resuma este processo.",
  "O que mudou recentemente neste processo?",
  "O que devo fazer agora?",
  "Explique a última movimentação.",
  "Sugira próximos passos.",
  "Há jurisprudência relacionada a este processo?",
]

/** Conversa sobre uma decisão da base de jurisprudência. */
export const JURISPRUDENCE_PROMPTS = [
  "Explique esta decisão em linguagem simples.",
  "Qual é a tese e qual foi o resultado?",
  "Quais fundamentos aparecem no texto?",
  "Há decisões semelhantes na base?",
]

export const CLIENT_PROMPTS = [
  "Resuma a situação deste cliente.",
  "O que merece atenção neste cliente?",
  "Quais são as próximas ações?",
  "Analise os processos deste cliente.",
]

const SECTION: Record<string, Omit<AIContext, "scope">> = {
  dashboard: { subtitle: "Escritório", headline: "Pergunte sobre seu escritório", prompts: OFFICE_PROMPTS },
  tarefas: {
    subtitle: "Tarefas do escritório",
    headline: "O que preciso fazer?",
    prompts: ["Quais tarefas estão atrasadas?", "O que vence nos próximos 7 dias?", "Quais tarefas estão ligadas a processos com prazo próximo?"],
  },
  agenda: {
    subtitle: "Agenda do escritório",
    headline: "O que tenho para fazer?",
    prompts: ["O que tenho hoje na agenda?", "Quais compromissos exigem preparação?", "Quais compromissos estão ligados a clientes ou processos?"],
  },
  financeiro: {
    subtitle: "Financeiro do escritório",
    headline: "Como está o dinheiro do escritório?",
    prompts: ["Como está o financeiro do escritório?", "Quais clientes têm valores em atraso?", "O que está previsto para receber este mês?"],
  },
  documentos: {
    subtitle: "Documentos do escritório",
    headline: "Pergunte sobre os documentos",
    prompts: ["Quais documentos foram adicionados recentemente?", "O que merece minha atenção?"],
  },
  processos: {
    subtitle: "Processos do escritório",
    headline: "Pergunte sobre os processos",
    prompts: ["Quais processos estão parados?", "Quais processos tiveram movimentação esta semana?", "Quais prazos vencem nos próximos 7 dias?"],
  },
  jurisprudencia: {
    subtitle: "Jurisprudência",
    headline: "Pergunte à base de jurisprudência",
    prompts: [
      "Há jurisprudência sobre negativação indevida sem notificação prévia?",
      "O que a base tem sobre dano moral por cobrança indevida?",
      "Quais decisões o escritório salvou?",
    ],
  },
  clientes: {
    subtitle: "Clientes do escritório",
    headline: "Pergunte sobre os clientes",
    prompts: ["Quais clientes possuem processos ativos?", "Quais clientes têm valores em atraso?", "O que merece minha atenção?"],
  },
}

export function officeContext(section?: string): AIContext {
  return { scope: { type: "office" }, ...(SECTION[section ?? ""] ?? SECTION.dashboard) }
}

export function processContext(id: string, code: string): AIContext {
  return {
    scope: { type: "process", id },
    subtitle: `Processo ${code}`,
    headline: "O que está acontecendo neste processo?",
    prompts: PROCESS_PROMPTS,
  }
}

export function jurisprudenceContext(id: string, label: string): AIContext {
  return { scope: { type: "jurisprudence", id }, subtitle: label, headline: "O que esta decisão diz?", prompts: JURISPRUDENCE_PROMPTS }
}

export function clientContext(id: string, name: string): AIContext {
  return { scope: { type: "client", id }, subtitle: name, headline: "Como está este cliente?", prompts: CLIENT_PROMPTS }
}

/** Tarefa ligada a um processo ou cliente: a conversa usa os dados dele, com perguntas sobre a tarefa. */
export function taskPrompts(title: string, relatedTo: "process" | "client") {
  const t = `“${title}”`
  return [
    `Resuma o contexto da tarefa ${t}.`,
    relatedTo === "process"
      ? `Como a tarefa ${t} se relaciona com o andamento do processo?`
      : `Como a tarefa ${t} se relaciona com a situação do cliente?`,
    `Sugira próximos passos para a tarefa ${t}.`,
  ]
}

export const scopeKey = (scope: ChatScope) => (scope.type === "office" ? "office" : `${scope.type}:${scope.id}`)
