/**
 * POST /api/processes/search — consulta um processo por número CNJ.
 *
 * A requisição ao DataJud é feita pelo `python/datajud.py`. Esta rota executa o
 * script e repassa ao browser, em NDJSON, cada evento assim que acontece
 * (tentativa, HTTP 429, resposta parcial, timeout…), terminando com uma linha
 * `result` (ficha normalizada) ou `error`. O protocolo está em
 * `lib/services/processes/lookup-events.ts`.
 *
 * A credencial nunca sai do servidor: o script a lê de `DATAJUD_API_KEY`.
 */

import { NextResponse } from "next/server"
import { authorize } from "@/lib/auth/server"
import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { userMessageFor } from "@/lib/integrations/legal/datajud/errors"
import { buildProcessSheet } from "@/lib/services/processes/sheet"
import { runPythonLookup } from "@/lib/services/processes/python-lookup"
import type { LookupLine } from "@/lib/services/processes/lookup-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Limite defensivo: o campo só precisa comportar um CNJ formatado. */
const MAX_INPUT = 32

export async function POST(request: Request) {
  const denied = await authorize("processes.edit")
  if (denied) return denied
  let cnj: unknown
  try {
    const body = await request.json()
    cnj = (body as { cnj?: unknown } | null)?.cnj
  } catch {
    return NextResponse.json({ error: { code: "INVALID_CNJ", message: "Requisição inválida." } }, { status: 400 })
  }

  if (typeof cnj !== "string" || cnj.length > MAX_INPUT) {
    return NextResponse.json({ error: { code: "INVALID_CNJ", message: "Digite um número de processo CNJ válido." } }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: LookupLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
        } catch {
          // O browser fechou a conexão; o abort do request já mata o script.
        }
      }

      try {
        for await (const line of runPythonLookup(cnj, { signal: request.signal })) {
          if (line.type === "event") {
            console.info(`[datajud.py] ${line.event}`, JSON.stringify(line))
            send(line)
            continue
          }

          if (line.type === "error") {
            console.error(`[datajud.py] erro ${line.code}: ${line.message}`)
            send({ type: "error", code: line.code, message: userMessageFor(line.code), detail: line.message })
            continue
          }

          const external = line.found ? mapSearchResponse(line.response, line.cnj) : null
          console.info(
            `[datajud.py] resultado ${external ? "encontrado" : "nao_encontrado"} movimentos=${external?.movements.length ?? 0} cache=${line.cached}`,
          )
          send({
            type: "result",
            found: !!external,
            sheet: external ? buildProcessSheet(external) : null,
            cached: line.cached,
            fetchedAt: new Date().toISOString(),
          })
        }
      } catch (error) {
        console.error("[processes/search]", error)
        send({ type: "error", code: "UNEXPECTED", message: userMessageFor("UNEXPECTED") })
      } finally {
        try {
          controller.close()
        } catch {
          // já fechado
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
