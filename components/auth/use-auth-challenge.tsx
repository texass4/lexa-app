"use client"

import * as React from "react"
import { solveChallenge } from "@/lib/auth/protection/pow"

type Purpose = "signup" | "recover" | "resend"

export interface ChallengeProof {
  challenge: string
  solution: string
}

interface Solved extends ChallengeProof {
  readyAt: number
  issuedAt: number
}

/** Desafios ficam válidos por 30 min no servidor; renova antes disso. */
const RENEW_AFTER_MS = 20 * 60_000

async function fetchAndSolve(purpose: Purpose): Promise<Solved> {
  const issuedAt = Date.now()
  const res = await fetch(`/api/auth/challenge?purpose=${purpose}`, { cache: "no-store" })
  if (!res.ok) throw new Error(res.status === 429 ? "Muitas tentativas. Aguarde alguns minutos e tente de novo." : "Não foi possível preparar o formulário.")
  const { token, difficulty, minDelayMs } = (await res.json()) as { token: string; difficulty: number; minDelayMs: number }
  const solution = await solveChallenge(token, difficulty)
  return { challenge: token, solution, issuedAt, readyAt: issuedAt + minDelayMs + 250 }
}

/**
 * Desafio anti-bot dos formulários públicos: buscado e resolvido em segundo plano
 * enquanto a pessoa preenche (`lib/auth/protection/pow.ts`). `proof()` entrega um
 * desafio pronto — cada um vale para um envio, então já prepara o próximo.
 */
export function useAuthChallenge(purpose: Purpose) {
  const pending = React.useRef<Promise<Solved> | null>(null)
  const prepare = React.useCallback(() => {
    const next = fetchAndSolve(purpose)
    next.catch(() => undefined)
    pending.current = next
    return next
  }, [purpose])

  React.useEffect(() => {
    prepare()
  }, [prepare])

  return React.useCallback(async (): Promise<ChallengeProof> => {
    let solved = await (pending.current ?? prepare()).catch(() => prepare())
    if (Date.now() - solved.issuedAt > RENEW_AFTER_MS) solved = await prepare()
    const wait = solved.readyAt - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    prepare()
    return { challenge: solved.challenge, solution: solved.solution }
  }, [prepare])
}

/** Campo-isca: invisível para pessoas (e para leitores de tela); robôs costumam preencher. */
export function HoneypotField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
      <label>
        Site
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}
