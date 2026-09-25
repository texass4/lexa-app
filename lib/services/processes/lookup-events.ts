/**
 * Protocolo da consulta em tempo real (`POST /api/processes/search`).
 *
 * A rota responde NDJSON: uma linha JSON por evento, na ordem em que acontecem
 * no `python/datajud.py`, terminando em uma linha `result` ou `error`.
 *
 * Compartilhado por servidor e browser — não importa nada de servidor.
 */

import type { ProcessSheet } from "./sheet"

interface BaseEvent {
  type: "event"
  /** Epoch em segundos, do lado do script. */
  at?: number
  attempt?: number
  /** Segundos até a próxima tentativa; `null` quando desistiu. */
  wait?: number | null
}

export type LookupEvent =
  | (BaseEvent & { event: "start"; cnj: string; tribunal: string; alias: string })
  | (BaseEvent & { event: "cache_hit" })
  | (BaseEvent & { event: "request"; max: number })
  | (BaseEvent & { event: "response"; status: number; ms: number })
  | (BaseEvent & { event: "rate_limited"; status: 429; retry_after?: number | null })
  | (BaseEvent & { event: "partial"; failed: number; total?: number; timed_out: boolean; reported_total?: number })
  | (BaseEvent & { event: "server_error"; status: number })
  | (BaseEvent & { event: "network_error"; reason: "timeout" | "connection" })

export interface LookupResultLine {
  type: "result"
  found: boolean
  sheet: ProcessSheet | null
  cached: boolean
  fetchedAt: string
}

export interface LookupErrorLine {
  type: "error"
  code: string
  message: string
  /** Detalhe técnico do script (ex.: "HTTP 429 após todas as tentativas"). */
  detail?: string
}

export type LookupLine = LookupEvent | LookupResultLine | LookupErrorLine

/** Tom visual de cada evento no log da tela. */
export type EventTone = "info" | "success" | "warning" | "danger"

const seconds = (value?: number | null) => `${(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`
const retryIn = (wait?: number | null) => (wait ? ` Nova tentativa em ${seconds(wait)}.` : " Sem novas tentativas.")

/** Texto de uma linha do log, em linguagem de escritório. */
export function describeEvent(e: LookupEvent): { text: string; tone: EventTone } {
  switch (e.event) {
    case "start":
      return { text: `Consultando ${e.tribunal} no DataJud (${e.alias}).`, tone: "info" }
    case "cache_hit":
      return { text: "Resultado recente encontrado no cache local.", tone: "success" }
    case "request":
      return { text: `Tentativa ${e.attempt} de ${e.max}…`, tone: "info" }
    case "response":
      return { text: `HTTP ${e.status} em ${seconds(e.ms / 1000)}.`, tone: e.status === 200 ? "success" : "warning" }
    case "rate_limited":
      return {
        text: `HTTP 429 — limite de requisições do DataJud${e.retry_after != null ? ` (Retry-After: ${seconds(e.retry_after)})` : ""}.${retryIn(e.wait)}`,
        tone: "warning",
      }
    case "partial":
      return {
        text: `Resposta parcial: ${e.failed} de ${e.total ?? "?"} shards falharam${e.timed_out ? " (timed_out)" : ""}${
          e.reported_total ? `, a fonte contou ${e.reported_total} resultado(s) mas não os devolveu` : ""
        }.${retryIn(e.wait)}`,
        tone: "warning",
      }
    case "server_error":
      return { text: `HTTP ${e.status} — erro no servidor do DataJud.${retryIn(e.wait)}`, tone: "warning" }
    case "network_error":
      return {
        text: `${e.reason === "timeout" ? "Tempo de resposta esgotado" : "Falha de conexão"}.${retryIn(e.wait)}`,
        tone: e.wait ? "warning" : "danger",
      }
  }
}
