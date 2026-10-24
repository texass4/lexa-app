import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { authConfig, SESSION_COOKIE, verifySessionToken } from "./session"

/** A requisição atual tem uma sessão válida? */
export async function isAuthenticated(): Promise<boolean> {
  const config = authConfig()
  if (!config.ok) return false
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, config.secret)
}

/**
 * Barreira de servidor: toda página, Server Action e rota de API chama isto antes de ler ou
 * gravar qualquer dado. O proxy também barra, mas a autorização não depende só dele.
 */
export async function requireOwner(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/login")
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Sessão expirada. Entre de novo.")
    this.name = "UnauthorizedError"
  }
}

/** Versão para Server Actions e APIs: lança erro em vez de redirecionar. */
export async function assertOwner(): Promise<void> {
  if (!(await isAuthenticated())) throw new UnauthorizedError()
}
