/**
 * Contrato das rotas de consulta (`/api/processes/search` e `/api/processes/:id/sync`).
 *
 * Compartilhado por servidor e navegador. Só o modelo interno do LEXA
 * (`ProcessSheet`) e mensagens prontas para a tela — nenhum dado técnico da
 * fonte, código HTTP ou detalhe de erro.
 */

import type { LookupFailureReason } from "@/lib/integrations/legal/errors"
import type { ProcessSheet } from "./sheet"

export interface LookupSuccessBody {
  ok: true
  sheet: ProcessSheet
  /** ISO (UTC) de quando as informações foram conferidas na fonte. */
  checkedAt: string
  /** O servidor está buscando uma versão mais nova em segundo plano. */
  refreshing: boolean
}

export interface LookupFailureBody {
  ok: false
  reason: LookupFailureReason | "forbidden"
  message: string
}

export type LookupBody = LookupSuccessBody | LookupFailureBody

/** Maior entrada aceita: um CNJ formatado tem 25 caracteres. */
export const MAX_CNJ_INPUT = 32
