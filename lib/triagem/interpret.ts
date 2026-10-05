/**
 * Interpretação de um evento da Triagem pela Íntegra IA — o pedido ao modelo e a
 * conferência da resposta. Lógica pura (o worker em `lib/services/triagem/` chama o
 * modelo e grava).
 *
 * A IA ajuda a ler; nunca decide nem inventa:
 * - resume em uma frase e diz se o evento exige ação ("sim", "não", "incerto");
 * - prazo: só copia o que o teor diz ("15 dias" + o trecho literal). O trecho precisa
 *   existir no original e conter o número — senão, é descartado;
 * - a data NUNCA vem da IA: é calculada pelas mesmas regras da sugestão
 *   (`lib/intimacoes/deadline.ts`), e só quando as regras não acharam prazo sozinhas;
 * - qualquer dúvida ou divergência manda o evento para revisão manual.
 */

import { object, oneOf, string, type Infer } from "@/lib/ai/schema"
import { fold } from "@/lib/core/format"
import { findTerms, suggestDeadline, type DeadlineSuggestion } from "@/lib/intimacoes/deadline"
import { readableContent } from "@/lib/integrations/legal/djen/mapper"
import { maskSensitiveText } from "@/lib/ai/context/sanitize"
import type { TriageAI, TriageKind } from "@/types"

/** Texto enviado ao modelo: o suficiente para uma intimação longa, sem estourar o pedido. */
const MAX_TEXT = 12_000

export interface InterpretInput {
  id: string
  organizationId: string
  kind: TriageKind
  title: string
  /** Teor original (intimação) ou nome + complementos (movimentação). */
  text: string
  eventDate: string
  availableAt?: string
  tribunal?: string
  classe?: string
  /** Sugestão das regras, calculada na captura. */
  suggestion?: DeadlineSuggestion
  attempts: number
}

export const INTERPRET_TASK = `Você recebe UM evento jurídico de um processo — uma intimação publicada no Diário de Justiça Eletrônico Nacional (DJEN) ou uma movimentação processual — com o texto original. Interprete somente o que está escrito nele.

1. resumo: uma frase curta (até 200 caracteres) dizendo o que foi comunicado ou determinado e a quem. Sem opinião.
2. exigeAcao:
   - "sim" se o texto determina ou abre oportunidade para a parte fazer algo (manifestar-se, contestar, apresentar documentos, pagar, comparecer, recorrer, cumprir decisão);
   - "nao" se é apenas ciência ou registro, sem providência;
   - "incerto" se o texto não permite saber.
3. motivo: uma frase explicando a resposta de exigeAcao, com base no texto.
4. Prazo — COPIE, não calcule: se o texto disser expressamente um número de dias, coloque só o número em prazoDias e copie em prazoTrecho, literalmente, o trecho do texto que traz esse número. Em prazoContagem, use "uteis" ou "corridos" só se o texto disser; senão, "nao_informado". Se o texto não trouxer número de dias (inclusive "prazo legal" sem número), deixe prazoDias e prazoTrecho vazios. Nunca informe datas.
5. Não use conhecimento de prazos legais para completar o que o texto não diz.`

export const interpretationSchema = object({
  resumo: string({ description: "Uma frase curta sobre o que o evento comunica.", min: 1, max: 240 }),
  exigeAcao: oneOf(["sim", "nao", "incerto"], { description: "O evento exige ação do escritório?" }),
  motivo: string({ description: "Por que exige (ou não) ação, com base no texto.", max: 300 }),
  prazoDias: string({ description: 'Número de dias escrito no texto (ex.: "15"), ou vazio.', max: 4 }),
  prazoContagem: oneOf(["uteis", "corridos", "nao_informado"]),
  prazoTrecho: string({ description: "Trecho literal do texto com o prazo, ou vazio.", max: 300 }),
})

export type Interpretation = Infer<typeof interpretationSchema>

/** Dados enviados ao modelo: só o evento (nada de outros clientes ou processos), com CPF/CNPJ e e-mails mascarados. */
export function interpretationContext(input: InterpretInput) {
  const text = maskSensitiveText(readableContent(input.text))
  return {
    tipo_evento: input.kind === "intimacao" ? "Intimação (DJEN)" : "Movimentação processual",
    titulo: input.title,
    tribunal: input.tribunal ?? null,
    classe: input.classe ?? null,
    data: input.eventDate,
    texto: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}… [texto cortado]` : text,
  }
}

export const INTERPRET_REQUEST = "Interprete o evento acima seguindo a TAREFA e responda no formato pedido."

/**
 * Confere a resposta contra o original e monta o que fica guardado. `reviewReason`
 * (quando há) manda o evento para revisão manual.
 */
export function finalizeInterpretation(
  input: InterpretInput,
  raw: Interpretation,
  meta: { model?: string; now: Date },
): { ai: TriageAI; reviewReason?: string } {
  const text = readableContent(input.text)
  const reasons: string[] = []
  let term: TriageAI["term"]
  let discarded: string | undefined

  const days = Number(raw.prazoDias)
  if (raw.prazoDias && Number.isInteger(days) && days > 0 && days <= 365) {
    const excerpt = raw.prazoTrecho.trim()
    // O trecho precisa existir no teor (ignorando acentos, caixa e espaços) e trazer o número.
    const literal = excerpt.length >= 4 && fold(text).includes(fold(excerpt))
    const found = literal ? findTerms(excerpt).find((t) => t.unit === "dias" && t.value === days) : undefined
    if (found) {
      const unit = raw.prazoContagem === "corridos" || found.countUnit === "corridos" ? "corridos" : "uteis"
      term = { days, unit, excerpt }
    } else {
      discarded = `A IA indicou prazo de ${days} dias, mas o trecho citado não está no teor — descartado.`
    }
  }

  let fatalDate: string | undefined
  let basis: string[] | undefined
  const rules = input.suggestion
  if (term && input.kind === "intimacao" && input.availableAt) {
    if (rules?.days) {
      if (rules.days !== term.days) {
        reasons.push(`A leitura do teor pelas regras (${rules.days} dias) e a da Íntegra IA (${term.days} dias) divergem: confira o prazo.`)
      }
    } else {
      // As regras não acharam prazo sozinhas: a data sai delas, com os dias lidos pela IA.
      const s = suggestDeadline({
        availableAt: input.availableAt,
        text: input.text,
        tribunal: input.tribunal,
        classe: input.classe,
        days: term.days,
        unit: term.unit,
        daysFrom: "ia",
        excerpt: term.excerpt,
      })
      fatalDate = s.fatalDate
      basis = s.basis
      reasons.push(`Prazo de ${term.days} dias lido só pela Íntegra IA: confira o trecho antes de confirmar.`)
    }
  }
  if (raw.exigeAcao === "incerto") reasons.push("A Íntegra IA não conseguiu dizer se o evento exige ação: revise.")
  if (raw.exigeAcao === "nao" && rules?.days) reasons.push("O teor traz prazo, mas a Íntegra IA entendeu que não exige ação: confira.")

  return {
    ai: {
      summary: raw.resumo,
      requiresAction: raw.exigeAcao,
      reason: raw.motivo || undefined,
      term,
      fatalDate,
      basis,
      discarded,
      model: meta.model,
      generatedAt: meta.now.toISOString(),
    },
    reviewReason: reasons.length ? reasons.join(" ") : undefined,
  }
}
