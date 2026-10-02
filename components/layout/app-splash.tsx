"use client"

import * as React from "react"
import { Wordmark } from "@/components/brand/logo"
import { BRAND, SYMBOL } from "@/lib/core/brand"

/**
 * Intro da Íntegra — aparece só enquanto o app realmente inicializa.
 *
 * Fica por cima de tudo desde o primeiro HTML (as animações são CSS, então
 * rodam antes da hidratação e não piscam) e sai quando:
 * - os dados do escritório terminaram de carregar (`"app"`); ou
 * - a sessão está pronta e os dados demoram mais que `DATA_GRACE_MS` — aí as
 *   telas assumem com os próprios esqueletos, em vez de segurar a intro; ou
 * - a sessão resolveu para uma tela própria (aguardando aprovação, sem acesso).
 *
 * Não há tempo mínimo: se tudo carregar rápido, a intro some rápido. Navegar
 * entre páginas não mostra a intro de novo — o layout do app continua montado.
 */

type Stage = "session" | "app"

const SplashContext = React.createContext<((stage: Stage) => void) | null>(null)

/** Depois da sessão pronta, quanto a intro ainda espera pelos dados. */
const DATA_GRACE_MS = 1200
/** Duração da saída (igual à transição em `globals.css`). */
const EXIT_MS = 320

export function SplashGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = React.useState<"visible" | "leaving" | "gone">("visible")
  const [sessionReady, setSessionReady] = React.useState(false)

  const signal = React.useCallback((stage: Stage) => {
    if (stage === "session") setSessionReady(true)
    else setPhase((current) => (current === "visible" ? "leaving" : current))
  }, [])

  React.useEffect(() => {
    if (!sessionReady || phase !== "visible") return
    const timer = window.setTimeout(() => signal("app"), DATA_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [sessionReady, phase, signal])

  React.useEffect(() => {
    if (phase !== "leaving") return
    const timer = window.setTimeout(() => setPhase("gone"), EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  return (
    <SplashContext.Provider value={signal}>
      {children}
      {phase !== "gone" && <Splash leaving={phase === "leaving"} />}
    </SplashContext.Provider>
  )
}

/** Avisa a intro que uma etapa da inicialização terminou. */
export function useSplashReady(stage: Stage, when: boolean) {
  const signal = React.useContext(SplashContext)
  React.useEffect(() => {
    if (when) signal?.(stage)
  }, [when, stage, signal])
}

function Splash({ leaving }: { leaving: boolean }) {
  return (
    <div
      className="brand-splash fixed inset-0 z-[200] flex items-center justify-center bg-background"
      data-leaving={leaving || undefined}
      role={leaving ? undefined : "status"}
      aria-label={leaving ? undefined : `Carregando a ${BRAND.name}`}
      aria-hidden={leaving || undefined}
    >
      <div className="brand-splash-content flex flex-col items-center">
        <svg viewBox={SYMBOL.viewBox} className="brand-splash-mark size-14 drop-shadow-[0_12px_24px_rgb(15_36_70/0.18)]" aria-hidden>
          <rect width="32" height="32" rx={SYMBOL.radius} fill="var(--logo-tile)" />
          <path d={SYMBOL.beam} fill="var(--logo-glyph)" />
          <path className="brand-splash-accent" d={SYMBOL.accent} fill="var(--logo-accent)" />
        </svg>
        <span className="brand-splash-word mt-5">
          <Wordmark className="h-[22px]" />
        </span>
        <span className="brand-splash-bar relative mt-6 block h-[2px] w-24 overflow-hidden rounded-full bg-border" aria-hidden>
          <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-brand" />
        </span>
      </div>
    </div>
  )
}
