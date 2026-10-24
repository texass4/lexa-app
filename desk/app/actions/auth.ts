"use server"

import { headers, cookies } from "next/headers"
import { redirect } from "next/navigation"
import { authConfig, checkPassword, createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session"

// Limite simples contra tentativa e erro: 8 tentativas por 15 minutos por endereço.
const attempts = new Map<string, { count: number; until: number }>()
const WINDOW = 15 * 60 * 1000
const MAX = 8

export type LoginState = { error?: string }

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/"
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/"
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const config = authConfig()
  if (!config.ok) return { error: `A Mesa ainda não foi configurada: ${config.reason}` }
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  const now = Date.now()
  const entry = attempts.get(ip)
  if (entry && entry.until > now && entry.count >= MAX) return { error: "Muitas tentativas. Espere alguns minutos e tente de novo." }

  const ok = await checkPassword(String(form.get("password") ?? ""))
  if (!ok) {
    const current = entry && entry.until > now ? entry : { count: 0, until: now + WINDOW }
    attempts.set(ip, { count: current.count + 1, until: current.until })
    await new Promise((r) => setTimeout(r, 400))
    return { error: "Senha incorreta." }
  }
  attempts.delete(ip)
  const store = await cookies()
  store.set(SESSION_COOKIE, await createSessionToken(config.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  })
  redirect(safeNext(form.get("next")))
}

export async function logoutAction() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect("/login")
}
