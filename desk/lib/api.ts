import "server-only"
import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth/server"
import { describeDbError, invalid, isAppError } from "@/lib/services/errors"

/** Envolve as rotas de API: exige sessão e devolve erros como JSON legível. */
export async function apiHandler(fn: () => Promise<Response | unknown>): Promise<Response> {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  try {
    const result = await fn()
    if (result instanceof Response) return result
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400 })
    const db = describeDbError(error)
    if (db) return NextResponse.json({ error: db }, { status: 400 })
    console.error("[mesa] erro inesperado na API:", error)
    return NextResponse.json({ error: "Erro interno ao processar o pedido." }, { status: 500 })
  }
}

export async function readJson(request: Request, maxBytes = 4_000_000): Promise<unknown> {
  const text = await request.text()
  if (text.length > maxBytes) throw invalid("Conteúdo grande demais para salvar de uma vez.")
  try {
    return JSON.parse(text)
  } catch {
    throw invalid("Conteúdo inválido.")
  }
}
