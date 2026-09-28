"use client"

import * as React from "react"

/**
 * Intro do LEXA — aparece só enquanto o app realmente inicializa.
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
      className="lexa-splash fixed inset-0 z-[200] flex items-center justify-center bg-background"
      data-leaving={leaving || undefined}
      role={leaving ? undefined : "status"}
      aria-label={leaving ? undefined : "Carregando o LEXA"}
      aria-hidden={leaving || undefined}
    >
      <div className="lexa-splash-content flex flex-col items-center">
        <span className="lexa-splash-mark relative flex size-14 items-center justify-center overflow-hidden rounded-[15px] bg-[#171717] shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_12px_32px_-12px_rgb(23_23_23/0.35)] dark:bg-[#ECEBE8]">
          <svg viewBox="0 0 32 32" className="size-full" aria-hidden>
            <path className="lexa-splash-stroke" d="M11 8.5v15h10" fill="none" stroke="#C4A274" strokeWidth="2.4" strokeLinecap="square" />
            <path className="lexa-splash-accent" d="M16 8.5h5" fill="none" stroke="#C4A274" strokeWidth="1.2" strokeLinecap="square" />
          </svg>
        </span>
        <span className="lexa-splash-word mt-5 pl-[0.32em] text-[13px] font-semibold tracking-[0.32em] text-foreground">LEXA</span>
        <span className="lexa-splash-bar relative mt-6 block h-[2px] w-24 overflow-hidden rounded-full bg-border" aria-hidden>
          <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-gold" />
        </span>
      </div>
    </div>
  )
}
