/**
 * Sigilo na consulta processual — a regra única, aplicada no servidor ANTES das
 * consultas complementares e ANTES de montar (e gravar) o relatório.
 *
 * Três situações, nunca misturadas:
 * - `protected`: segredo de justiça marcado no cadastro do escritório, ou nível de
 *   sigilo > 0 informado pela fonte principal (DataJud);
 * - `public`: a fonte principal informou nível 0;
 * - `unknown`: a fonte não informou o nível (ou não respondeu) — NÃO é tratado como
 *   público.
 *
 * O que muda fora de `public`:
 * - comunicações oficiais (DJEN: teor, destinatários, advogados, menções) não são
 *   consultadas — trazem nomes e trechos de atos;
 * - o relatório não guarda partes, advogados, menções a magistrado, trechos de
 *   comunicação nem o complemento escrito das movimentações (só o movimento e a data).
 * O índice do tribunal superior (DataJud, só metadados) não é consultado para processo
 * `protected`; em `unknown` segue permitido — é a mesma API pública que define o sigilo.
 * Nada aqui altera o nível de sigilo nem o cadastro.
 */

import type { ProcessSheet } from "@/lib/services/processos/sheet"
import type { Process } from "@/types"
import type { EnrichmentReport, ReportValue } from "./types"

/** Como o relatório escreve o nível 0 informado pela fonte (`buildFields`). */
export const PUBLIC_SECRECY_LABEL = "Público (nível 0)"

export type ProtectionLevel = "protected" | "public" | "unknown"

export interface Protection {
  level: ProtectionLevel
  /** Por que: cadastro (segredo de justiça), fonte (nível > 0), fonte sem nível, sem fonte. */
  reason: "cadastro" | "fonte" | "fonte_sem_nivel" | "sem_fonte" | "fonte_publica"
}

/** Situação de sigilo com o que se sabe agora (cadastro e, se houver, a ficha da fonte). */
export function processProtection(input: { process?: Pick<Process, "secret"> | null; sheet?: Pick<ProcessSheet, "secrecyLevel"> | null }): Protection {
  if (input.process?.secret) return { level: "protected", reason: "cadastro" }
  const level = input.sheet?.secrecyLevel
  if (typeof level === "number" && level > 0) return { level: "protected", reason: "fonte" }
  if (level === 0) return { level: "public", reason: "fonte_publica" }
  return { level: "unknown", reason: input.sheet ? "fonte_sem_nivel" : "sem_fonte" }
}

/** Comunicações oficiais (teor, nomes, advogados) só para processo confirmado como público. */
export const mayQueryCommunications = (p: Protection) => p.level === "public"

/** Índice do tribunal superior (DataJud, metadados): não para processo protegido. */
export const mayQuerySuperior = (p: Protection) => p.level !== "protected"

/** Partes, advogados, menções, trechos e complementos só entram no relatório de processo público. */
export const mayStoreRestricted = (p: Protection) => p.level === "public"

/** Mensagem pública de por que a fonte não foi consultada (sem nenhum detalhe do processo). */
export function protectionSkipMessage(p: Protection): string {
  if (p.reason === "cadastro") return "Não consultada: processo em segredo de justiça."
  if (p.reason === "fonte") return "Não consultada: a fonte principal informa sigilo."
  return "Não consultada: o nível de sigilo não foi confirmado pela fonte principal."
}

/**
 * Relatório GRAVADO antes desta regra (ou por qualquer caminho antigo): ao ler, o que
 * é restrito sai se o relatório não mostra o processo como público — nível 0 informado
 * pela fonte e sem segredo de justiça no cadastro. Só na leitura: o registro no banco
 * não é alterado. Relatório novo já vem assim (não muda nada).
 */
export function redactStoredReport(report: EnrichmentReport): EnrichmentReport {
  const sigilo = report.fields.find((f) => f.key === "sigilo")
  const declaredPublic = !!sigilo?.values.some((v) => v.source === "datajud" && v.value === PUBLIC_SECRECY_LABEL)
  if (declaredPublic && !report.office?.secret) return report

  const hasRestricted =
    report.parties.items.length > 0 ||
    report.parties.lawyers.length > 0 ||
    report.magistrate.mentions.length > 0 ||
    report.communications.items.length > 0 ||
    report.movements.items.some((m) => m.description) ||
    report.fields.some((f) => f.values.some((v) => v.source === "djen"))
  if (!hasRestricted) return report

  const withoutDjen = (values: ReportValue[]) => values.filter((v) => v.source !== "djen")
  const fields = report.fields.map((f) => {
    const values = withoutDjen(f.values)
    return { ...f, values, conflict: f.conflict && values.length > 1 }
  })
  return {
    ...report,
    fields,
    conflicts: report.conflicts.map((c) => ({ ...c, values: withoutDjen(c.values) })).filter((c) => c.values.length > 1),
    parties: { items: [], lawyers: [], note: "Partes não exibidas: processo com sigilo ou nível de sigilo não confirmado pela fonte." },
    magistrate: {
      ...report.magistrate,
      mentions: [],
      unit: report.magistrate.unit?.source === "djen" ? undefined : report.magistrate.unit,
      tribunal: report.magistrate.tribunal?.source === "djen" ? undefined : report.magistrate.tribunal,
    },
    communications: { items: [], total: 0, truncated: false },
    movements: { ...report.movements, items: report.movements.items.map((m) => ({ ...m, description: undefined })) },
    notices: [...report.notices, "Comunicações, partes e complementos das movimentações não são exibidos: processo com sigilo ou nível de sigilo não confirmado pela fonte."],
  }
}
