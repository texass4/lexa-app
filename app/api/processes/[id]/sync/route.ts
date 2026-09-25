/**
 * POST /api/processes/:id/sync — rebusca a ficha do processo na fonte.
 *
 * Usa o mesmo `python/datajud.py` da consulta, com `--refresh`: sincronizar é
 * um pedido explícito do usuário, então o cache é ignorado na leitura (e
 * atualizado com o retrato novo). A rota devolve o retrato atual; quem guarda
 * os dados decide o que é novo, comparando hashes com `diffMovements`.
 *
 * O `id` é o identificador interno do processo no LEXA e serve para log e para
 * o dia em que a persistência sair do browser — por isso o CNJ vem no corpo.
 */

import { NextResponse } from "next/server"
import { mapSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import { userMessageFor } from "@/lib/integrations/legal/datajud/errors"
import { buildProcessSheet } from "@/lib/services/processes/sheet"
import { runPythonLookup } from "@/lib/services/processes/python-lookup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_INPUT = 32
/** Aceita id interno do LEXA (`p_102938`, `p_abc123`). */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

const STATUS: Record<string, number> = {
  INVALID_CNJ: 400,
  UNSUPPORTED_COURT: 422,
  RATE_LIMIT: 429,
  TIMEOUT: 504,
  PROVIDER_NOT_CONFIGURED: 503,
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: { code: "INVALID_CNJ", message: "Processo inválido." } }, { status: 400 })
  }

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

  try {
    for await (const line of runPythonLookup(cnj, { signal: request.signal, refresh: true })) {
      if (line.type === "event") {
        console.info(`[datajud.py] sync ${id} ${line.event}`, JSON.stringify(line))
        continue
      }

      if (line.type === "error") {
        console.error(`[processes/sync] ${id} ${line.code}: ${line.message}`)
        return NextResponse.json(
          { error: { code: line.code, message: userMessageFor(line.code), detail: line.message }, provider: "datajud" },
          { status: STATUS[line.code] ?? 502 },
        )
      }

      const external = line.found ? mapSearchResponse(line.response, line.cnj) : null
      if (!external) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Não foi possível localizar esse processo na fonte consultada." }, provider: "datajud" },
          { status: 404 },
        )
      }

      return NextResponse.json({
        processId: id,
        sheet: buildProcessSheet(external),
        provider: "datajud",
        cached: line.cached,
        fetchedAt: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error("[processes/sync]", id, error)
  }

  return NextResponse.json({ error: { code: "UNEXPECTED", message: userMessageFor("UNEXPECTED") } }, { status: 500 })
}
