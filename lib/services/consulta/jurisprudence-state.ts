/**
 * Estado da pesquisa de jurisprudência no relatório da consulta processual — e a frase
 * de cada um. Puro (servidor e navegador). Cada estado tem a sua mensagem: não rodar
 * (faltaram termos), não estar configurada, falhar, demorar demais e não achar NUNCA
 * aparecem como a mesma coisa.
 */

import type { EnrichmentReport, JurisprudenceState, SourceStatus } from "./types"

export const JURISPRUDENCE_STATE_MESSAGE: Record<Exclude<JurisprudenceState, "results">, string> = {
  no_results:
    "Pesquisa feita: nenhuma decisão relacionada na base de jurisprudência da Íntegra para estes termos. Isso não quer dizer que não existam decisões sobre o tema.",
  not_run: "Pesquisa não realizada: faltaram termos (assunto, classe ou tipo de ação) para orientá-la.",
  not_configured: "Pesquisa não realizada: a base de jurisprudência não está configurada neste ambiente.",
  unavailable: "Pesquisa não concluída: a base de jurisprudência não respondeu. Tente novamente mais tarde.",
  timeout: "Pesquisa interrompida: a base de jurisprudência demorou demais para responder.",
}

/**
 * O estado gravado; em relatório antigo (sem o campo), deduzido do estado registrado da
 * fonte — uma lista vazia sozinha não diz se a pesquisa rodou.
 */
export function jurisprudenceState(j: EnrichmentReport["jurisprudence"], sourceStatus?: SourceStatus): JurisprudenceState {
  if (j.state) return j.state
  if (j.items.length) return "results"
  switch (sourceStatus) {
    case "ok":
      return "results"
    // Antes deste campo, "termos insuficientes" era gravado como "não encontrado" com a mensagem do motivo.
    case "not_found":
      return j.message ? "not_run" : "no_results"
    case "skipped":
      return "not_run"
    case "not_configured":
      return "not_configured"
    case "timeout":
      return "timeout"
    case "unavailable":
    case "rate_limited":
    case "error":
      return "unavailable"
    default:
      return j.message ? "not_run" : "no_results"
  }
}

/** Frase para o estado (no "não realizada", o motivo específico gravado, quando houver). */
export function jurisprudenceMessage(j: EnrichmentReport["jurisprudence"], state: JurisprudenceState): string | undefined {
  if (state === "results") return undefined
  if (state === "not_run" && j.message) return /^pesquisa não realizada/i.test(j.message) ? j.message : `Pesquisa não realizada: ${j.message.charAt(0).toLowerCase()}${j.message.slice(1)}`
  return JURISPRUDENCE_STATE_MESSAGE[state]
}
