"use client"

import { getNow, fmtFullDate, greeting } from "@/lib/core/dates"
import { getUser, currentUserId } from "@/lib/auth/account"
import { countByLevel, type AttentionSignal } from "@/lib/dashboard/attention"
import { NewMenu } from "@/components/layout/new-menu"
import { WeatherChip } from "./weather-chip"

const piece = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * A frase de abertura é uma leitura do escritório, não um contador: quantos pontos
 * pedem ação hoje e quantos só pedem uma verificação. Os detalhes estão logo abaixo.
 */
function statusLine(signals: AttentionSignal[], empty: boolean) {
  if (empty) return "Seu escritório está pronto. Comece cadastrando um cliente ou consultando um processo."
  const { critical, warning } = countByLevel(signals)
  if (critical && warning) return `${piece(critical, "ponto precisa de atenção hoje", "pontos precisam de atenção hoje")} · ${piece(warning, "para verificar", "para verificar")}`
  if (critical) return piece(critical, "ponto precisa de atenção hoje", "pontos precisam de atenção hoje")
  if (warning) return `Nada urgente · ${piece(warning, "ponto para verificar", "pontos para verificar")}`
  return "Tudo em dia no escritório"
}

export function Greeting({ signals, empty = false }: { signals: AttentionSignal[]; empty?: boolean }) {
  const user = getUser(currentUserId())

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {/* O painel só renderiza depois da hidratação, então a data do navegador é segura aqui. */}
        <p className="text-[11.5px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{fmtFullDate(getNow())}</p>
        <h1 className="mt-2.5 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-foreground sm:text-[36px]">
          {greeting()}, <span className="text-gold">{user.firstName}</span>.
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{statusLine(signals, empty)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <WeatherChip />
        <NewMenu />
      </div>
    </div>
  )
}
