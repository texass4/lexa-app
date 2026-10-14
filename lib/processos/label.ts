/**
 * Identificação humana de um processo: "João da Silva — Ação de cobrança" em vez de
 * "Processo #103023". Usa só o que está cadastrado (cliente, tipo, classe, área) —
 * nada é inventado. O número fica como informação secundária.
 */

import type { Process } from "@/types"
import { formatCNJ, hasValidCheckDigits, onlyDigits } from "./cnj"
import { originAcronym } from "./tribunals"

type Labelled = Pick<Process, "type" | "area" | "number" | "code"> & Partial<Pick<Process, "className" | "subject">>

/** O assunto do processo: tipo de ação do escritório, classe da fonte ou, por fim, a área ("Processo trabalhista"). */
export function processSubject(process: Labelled): string {
  const subject = process.type?.trim() || process.className?.trim() || process.subject?.trim()
  if (subject) return subject
  return process.area ? `Processo ${process.area.toLocaleLowerCase("pt-BR")}` : "Processo"
}

/** "João da Silva — Ação de cobrança"; sem cliente, só o assunto. */
export function processTitle(process: Labelled, clientName?: string): string {
  const subject = processSubject(process)
  const client = clientName?.trim()
  return client ? `${client} — ${subject}` : subject
}

/**
 * Número para exibir como informação secundária, sem apresentar como oficial o que não é:
 * CNJ válido → formatado; 20 dígitos com dígito verificador errado → formatado com o aviso;
 * outro texto → marcado como fora do padrão; sem número → o código interno, dito como tal.
 */
export function processNumberLabel(process: Labelled): string {
  const raw = process.number?.trim() ?? ""
  const digits = onlyDigits(raw)
  if (digits.length === 20) return hasValidCheckDigits(digits) ? formatCNJ(digits) : `${formatCNJ(digits)} (dígito não confere)`
  if (raw) return `${raw} (fora do padrão CNJ)`
  return process.code ? `Sem número · cód. interno ${process.code}` : "Sem número"
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Textos já gravados (atividades) citam o processo pelo código ("Processo #103023").
 * Na exibição, a citação vira a identificação humana — sem alterar o registro:
 * um trecho que é só o processo ("… · Processo #103023") vira o rótulo; no meio de
 * uma frase, "processo “João da Silva — Ação de cobrança”".
 */
export function humanizeProcessMention(text: string, code: string | undefined, label: string): string {
  if (!code || !text) return text
  const mention = new RegExp(`([Pp]rocesso) ${escape(code)}(?![\\d])`, "g")
  if (!mention.test(text)) return text
  return text
    .split(" · ")
    .map((part) =>
      new RegExp(`^[Pp]rocesso ${escape(code)}$`).test(part.trim()) ? label : part.replace(mention, (_, word: string) => `${word} “${label}”`),
    )
    .join(" · ")
}

const DISTRICT_PLACEHOLDER = /^(a definir|não informado|nao informado)$/i

/**
 * Comarca do processo para exibir, ou `undefined`. Cadastros importados antes da
 * correção guardaram a sigla do tribunal como comarca ("TJSP"): ela é ignorada na
 * leitura, sem regravar o registro.
 */
export function processDistrict(process: Pick<Process, "district" | "tribunal" | "cnj" | "number">): string | undefined {
  const district = process.district?.trim()
  if (!district || DISTRICT_PLACEHOLDER.test(district)) return undefined
  const key = district.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const acronyms = [process.tribunal, originAcronym(onlyDigits(process.cnj ?? process.number ?? ""))]
  return acronyms.some((a) => a && a.toUpperCase().replace(/[^A-Z0-9]/g, "") === key) ? undefined : district
}
