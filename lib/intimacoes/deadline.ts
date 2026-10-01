/**
 * Sugestão de prazo a partir de uma intimação — regras determinísticas, explicáveis.
 *
 *   disponibilização (fonte) → publicação = 1º dia útil seguinte (Lei 11.419/2006, art. 4º, §3º)
 *   → início da contagem = 1º dia útil após a publicação (art. 4º, §4º; CPC, art. 224, §3º)
 *   → N dias úteis (CPC, art. 219), sem contar 20/12–20/01 (CPC, art. 220)
 *
 * N só vem do próprio teor ("no prazo de 15 (quinze) dias"). Nada é inventado: sem
 * prazo explícito, com prazos diferentes no mesmo texto, prazo em horas, prazo
 * "legal"/em dobro ou processo criminal (dias corridos), a sugestão vai para
 * revisão e o advogado informa ou confirma o número de dias. Nunca vira Prazo sem
 * a confirmação dele.
 *
 * Lógica pura: roda no worker (captura) e no navegador (quando o advogado ajusta os dias).
 */

import { fold } from "@/lib/format"
import { addBusinessDays, addCalendarDeadline, nextBusinessDay, type CalendarOptions } from "./calendar"

export type SuggestionConfidence = "alta" | "revisao"

export interface DeadlineSuggestion {
  /** Data de disponibilização informada pela fonte (`YYYY-MM-DD`). */
  availableAt: string
  /** Data de publicação considerada: 1º dia útil seguinte à disponibilização. */
  publishedAt: string
  /** Primeiro dia da contagem. */
  startAt: string
  /** Dias do prazo (do teor ou informados pelo advogado). */
  days?: number
  unit?: "uteis" | "corridos"
  /** Data fatal sugerida. Ausente quando não há número de dias. */
  fatalDate?: string
  /** De onde veio o número de dias. */
  daysSource?: "teor" | "advogado" | "ia"
  /** Trecho do teor em que o prazo foi encontrado (texto original). */
  excerpt?: string
  confidence: SuggestionConfidence
  /** Por que precisa de revisão. */
  reasons: string[]
  /** Regras aplicadas, na ordem do cálculo. */
  basis: string[]
  /** O que o cálculo não considera. */
  caveat: string
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, sessenta: 60, noventa: 90,
} // prettier-ignore

const WORDS = Object.keys(NUMBER_WORDS).join("|")
// "prazo de 15 (quinze) dias úteis", "prazo comum de 10 dias", "em 5 dias", "no prazo de quinze dias", "48 horas"
const TERM = new RegExp(
  String.raw`(?:prazo\s+(?:comum\s+|sucessivo\s+|improrrogavel\s+)?(?:de\s+)?|\bem\s+|\bdentro\s+de\s+)(\d{1,3}|${WORDS})(?:\s*\([^)]{0,40}\))?\s*(dias?|horas?)(?:\s+(uteis|corridos))?`,
  "g",
)

export interface TermFound {
  value: number
  unit: "dias" | "horas"
  countUnit?: "uteis" | "corridos"
  /** Trecho do texto original. */
  excerpt: string
}

/** Prazos explícitos no teor. O texto é normalizado só para buscar; o trecho devolvido é o original. */
export function findTerms(text: string): TermFound[] {
  // Mesmo espaçamento nos dois lados: sem acento e em minúsculas só para buscar (mesmo
  // tamanho em NFC), recortando o trecho na mesma posição do texto original.
  const original = text.normalize("NFC").replace(/\s+/g, " ").trim()
  const plain = fold(original)
  const found: TermFound[] = []
  for (const match of plain.matchAll(TERM)) {
    const raw = match[1]
    const value = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw]
    if (!value) continue
    const at = match.index ?? 0
    const excerpt = original.slice(Math.max(0, at - 40), at + match[0].length + 20).trim()
    found.push({ value, unit: match[2].startsWith("hora") ? "horas" : "dias", countUnit: match[3] as TermFound["countUnit"], excerpt })
  }
  return found
}

const CRIMINAL = /\b(penal|criminal|crime|reu preso|denuncia|inquerito policial|execucao penal|juri)\b/
const DOUBLE = /\b(em dobro|prazo em dobro)\b/
const LEGAL_TERM = /\bprazo legal\b/

export interface SuggestionInput {
  /** `YYYY-MM-DD` */
  availableAt: string
  text: string
  tribunal?: string
  classe?: string
  /** Dias informados pelo advogado (substitui o que veio do teor). */
  days?: number
  unit?: "uteis" | "corridos"
  /** Quem informou `days`: o advogado (padrão) ou a Íntegra IA, a partir de um trecho do teor. */
  daysFrom?: "advogado" | "ia"
  /** Trecho do teor que sustenta os dias informados pela IA. */
  excerpt?: string
}

const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export function suggestDeadline(input: SuggestionInput): DeadlineSuggestion {
  const options: CalendarOptions = { federal: /^TRF/i.test(input.tribunal ?? "") }
  const publishedAt = nextBusinessDay(input.availableAt, options)
  const startAt = nextBusinessDay(publishedAt, options)
  const basis = [
    `Disponibilizada em ${fmt(input.availableAt)} (fonte).`,
    `Publicação considerada em ${fmt(publishedAt)}: 1º dia útil seguinte à disponibilização (Lei 11.419/2006, art. 4º, §3º).`,
    `Contagem a partir de ${fmt(startAt)}: 1º dia útil após a publicação (Lei 11.419/2006, art. 4º, §4º; CPC, art. 224, §3º).`,
  ]
  const caveat = `Considera feriados nacionais${options.federal ? " e os da Justiça Federal (Lei 5.010/1966)" : ""} e a suspensão de 20/12 a 20/01 (CPC, art. 220). Não considera feriados locais nem portarias do ${input.tribunal ?? "tribunal"} — confira antes de confirmar.`

  const plain = fold(`${input.classe ?? ""} ${input.text}`)
  const reasons: string[] = []
  const criminal = CRIMINAL.test(plain)
  if (DOUBLE.test(plain)) reasons.push("O teor menciona prazo em dobro: confira se se aplica (CPC, arts. 180, 183 e 186).")

  let days = input.days
  let unit: "uteis" | "corridos" = input.unit ?? (criminal ? "corridos" : "uteis")
  let excerpt: string | undefined = input.days ? input.excerpt : undefined
  let daysSource: DeadlineSuggestion["daysSource"] = input.days ? (input.daysFrom ?? "advogado") : undefined
  if (daysSource === "ia") reasons.push("Prazo lido pela Íntegra IA no teor: confira o trecho antes de confirmar.")

  if (!input.days) {
    const terms = findTerms(input.text)
    const dayTerms = terms.filter((t) => t.unit === "dias")
    const distinct = [...new Set(dayTerms.map((t) => t.value))]
    if (terms.some((t) => t.unit === "horas")) reasons.push("O teor fala em prazo em horas: a contagem é diferente — revise.")
    if (distinct.length > 1) reasons.push(`O teor cita mais de um prazo (${distinct.join(" e ")} dias): escolha o que se aplica.`)
    if (distinct.length === 1) {
      days = distinct[0]
      excerpt = dayTerms[0].excerpt
      daysSource = "teor"
      if (dayTerms[0].countUnit) unit = dayTerms[0].countUnit
    }
    if (!dayTerms.length) {
      reasons.push(
        LEGAL_TERM.test(plain)
          ? "O teor fala em \"prazo legal\" sem dizer quantos dias: informe o prazo."
          : "Nenhum prazo explícito no teor: informe o prazo (ou rejeite, se for só ciência).",
      )
    }
  }
  if (criminal && !input.unit) reasons.push("Parece processo criminal: prazos em dias corridos (CPP, art. 798) — confira.")

  let fatalDate: string | undefined
  if (days && days > 0) {
    if (unit === "corridos") {
      fatalDate = addCalendarDeadline(startAt, days, options)
      basis.push(`${days} dias corridos; termina em dia útil (CPP, art. 798, §3º, por analogia): ${fmt(fatalDate)}.`)
    } else {
      fatalDate = addBusinessDays(startAt, days, options)
      basis.push(`${days} dias úteis (CPC, art. 219): ${fmt(fatalDate)}.`)
    }
  }

  return {
    availableAt: input.availableAt,
    publishedAt,
    startAt,
    days,
    unit: days ? unit : undefined,
    fatalDate,
    daysSource,
    excerpt,
    // Dias informados pelo advogado: a decisão já é dele.
    confidence: daysSource === "advogado" || (fatalDate && !reasons.length) ? "alta" : "revisao",
    reasons: daysSource === "advogado" ? [] : reasons,
    basis,
    caveat,
  }
}
