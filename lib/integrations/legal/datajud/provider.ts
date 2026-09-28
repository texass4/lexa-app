/**
 * DataJud como `ProcessProvider`: cliente HTTP + tradução para o modelo neutro.
 *
 * Somente servidor. A chave é lida de `DATAJUD_API_KEY` na hora da consulta —
 * variável sem `NEXT_PUBLIC_`, portanto nunca embutida no bundle do navegador.
 */

import { LookupError } from "../errors"
import type { ProcessProvider } from "../types"
import { createDataJudClient, type DataJudClient } from "./client"
import { mapSearchResponse } from "./mapper"
import { datasetFor, tribunalFor } from "./tribunals"

const apiKey = () => (process.env.DATAJUD_API_KEY ?? "").trim().replace(/^["']|["']$/g, "")

const log = (event: string, fields: Record<string, unknown>) => {
  const line = `[process-lookup] datajud ${event} ${JSON.stringify(fields)}`
  if (event === "response" && fields.status === 200) console.info(line)
  else console.warn(line)
}

let client: { key: string; instance: DataJudClient } | undefined

function getClient(): DataJudClient {
  if (typeof window !== "undefined") throw new Error("A consulta processual só roda no servidor.")
  const key = apiKey()
  if (!key) throw new LookupError("NOT_CONFIGURED", "DATAJUD_API_KEY não configurada")
  if (client?.key !== key) {
    const deadlineMs = Number(process.env.PROCESS_LOOKUP_TIMEOUT_MS) || undefined
    client = { key, instance: createDataJudClient({ apiKey: key, baseUrl: process.env.DATAJUD_BASE_URL, deadlineMs, log }) }
  }
  return client.instance
}

export const datajudProvider: ProcessProvider = {
  name: "datajud",
  async lookup(digits) {
    const tribunal = tribunalFor(digits)
    if (!tribunal) throw new LookupError("UNSUPPORTED_COURT", `sem índice para o segmento ${digits[13]}.${digits.slice(14, 16)}`)
    const response = await getClient().searchByNumber(digits, datasetFor(tribunal))
    return mapSearchResponse(response, digits)
  },
}
