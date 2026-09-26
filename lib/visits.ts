"use client"

/**
 * "Desde sua última visita" — quando a pessoa esteve no LEXA pela última vez.
 *
 * Guardado só no navegador (por pessoa): `localStorage` tem o último momento
 * em que o LEXA esteve aberto; `sessionStorage` congela esse valor no início
 * da sessão, para o painel comparar sempre com a mesma base enquanto a aba
 * estiver aberta. Sem armazenamento disponível, o recurso simplesmente não aparece.
 */

const lastSeenKey = (userId: string) => `lexa:last-seen:${userId}`
const baselineKey = (userId: string) => `lexa:visit-baseline:${userId}`
const NONE = "none"

function ensureBaseline(userId: string): string {
  const current = window.sessionStorage.getItem(baselineKey(userId))
  if (current) return current
  const last = window.localStorage.getItem(lastSeenKey(userId)) ?? NONE
  window.sessionStorage.setItem(baselineKey(userId), last)
  return last
}

/** Base da sessão: a visita anterior, ou `null` na primeira vez. */
export function readVisitBaseline(userId: string): Date | null {
  try {
    const value = ensureBaseline(userId)
    if (value === NONE) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/** "Entendi": a partir de agora, só o que mudar depois conta como novidade. */
export function acknowledgeVisit(userId: string, now: Date = new Date()) {
  try {
    window.sessionStorage.setItem(baselineKey(userId), now.toISOString())
  } catch {}
}

/**
 * Marca presença enquanto o LEXA está aberto (ao entrar e ao sair da aba).
 * Devolve a função que remove os ouvintes.
 */
export function trackVisit(userId: string): () => void {
  const mark = () => {
    try {
      window.localStorage.setItem(lastSeenKey(userId), new Date().toISOString())
    } catch {}
  }
  try {
    ensureBaseline(userId)
  } catch {}
  mark()
  const onVisibility = () => {
    if (document.visibilityState === "hidden") mark()
  }
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pagehide", mark)
  return () => {
    document.removeEventListener("visibilitychange", onVisibility)
    window.removeEventListener("pagehide", mark)
  }
}
