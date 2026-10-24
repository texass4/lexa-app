import "server-only"
import { revalidatePath } from "next/cache"
import { assertOwner, UnauthorizedError } from "@/lib/auth/server"
import { describeDbError, isAppError } from "@/lib/services/errors"

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Envolve toda Server Action: confere a sessão, executa, traduz erros para uma mensagem
 * exibível e invalida as telas para que todas as visualizações mostrem o dado novo.
 */
export async function runAction<T>(fn: () => Promise<T>, opts: { revalidate?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    await assertOwner()
    const data = await fn()
    if (opts.revalidate !== false) revalidatePath("/", "layout")
    return { ok: true, data }
  } catch (error) {
    if (error instanceof UnauthorizedError) return { ok: false, error: error.message }
    if (isAppError(error)) return { ok: false, error: error.message }
    const db = describeDbError(error)
    if (db) return { ok: false, error: db }
    console.error("[mesa] erro inesperado na ação:", error)
    return { ok: false, error: "Algo deu errado ao salvar. Tente de novo." }
  }
}
