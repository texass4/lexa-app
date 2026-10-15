"use client"

import Link from "next/link"
import { CalendarDays, ChevronDown } from "lucide-react"
import { cn } from "cn"
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
  if (critical && warning)
    return `${piece(critical, "ponto precisa de atenção hoje", "pontos precisam de atenção hoje")} · ${piece(warning, "para verificar", "para verificar")}`
  if (critical) return piece(critical, "ponto precisa de atenção hoje", "pontos precisam de atenção hoje")
  if (warning) return `Nada urgente · ${piece(warning, "ponto para verificar", "pontos para verificar")}`
  return "Tudo em dia no escritório"
}

/**
 * Boas-vindas do Início: saudação, a leitura do dia e, à direita, a data (abre a Agenda) e "Novo".
 * Fica dentro do bloco com a ilustração ambiental (`dashboard-view.tsx`).
 * `onToggleAttention`: a frase de status abre a lista do que merece atenção.
 */
export function Greeting({
  signals,
  empty = false,
  attentionOpen = false,
  onToggleAttention,
}: {
  signals: AttentionSignal[]
  empty?: boolean
  attentionOpen?: boolean
  onToggleAttention?: () => void
}) {
  const user = getUser(currentUserId())
  const hasSignals = !empty && signals.length > 0
  const now = getNow()

  return (
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {/* O painel só renderiza depois da hidratação, então a data do navegador é segura aqui. */}
        <h1 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.022em] text-foreground sm:text-[28px]">
          {greeting(now)}, {user.firstName}!
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">Aqui está um resumo do que precisa da sua atenção hoje.</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground">
          <span>{statusLine(signals, empty)}</span>
          {hasSignals && onToggleAttention && (
            <button
              type="button"
              onClick={onToggleAttention}
              aria-expanded={attentionOpen}
              aria-controls="painel-atencao"
              className="inline-flex items-center gap-1 rounded-md font-medium text-brand-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {attentionOpen ? "Ocultar a lista" : "Ver o que merece atenção"}
              <ChevronDown className={cn("size-4 transition-transform", attentionOpen && "rotate-180")} />
            </button>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="max-lg:hidden">
          <WeatherChip />
        </div>
        <Link
          href="/agenda"
          title="Abrir a agenda"
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface/95 px-3.5 text-[13px] font-medium text-foreground shadow-xs outline-none backdrop-blur-sm transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <CalendarDays className="size-4 text-brand" />
          {fmtFullDate(now).replace(/-feira/, "")}
        </Link>
        <NewMenu />
      </div>
    </div>
  )
}
