/**
 * Instância do cliente do DJEN usada pela captura. Somente servidor.
 * Sem chave: a API pública não exige autenticação. `DJEN_BASE_URL` só para homologação.
 */

import { createDjenClient, type DjenClient } from "./client"

let client: DjenClient | undefined

export function djenClient(): DjenClient {
  if (typeof window !== "undefined") throw new Error("A captura do DJEN só roda no servidor.")
  client ??= createDjenClient({
    baseUrl: process.env.DJEN_BASE_URL,
    log: (event, fields) => {
      const line = `[djen] ${event} ${JSON.stringify(fields)}`
      if (event === "response" && fields.status === 200) console.info(line)
      else console.warn(line)
    },
  })
  return client
}
