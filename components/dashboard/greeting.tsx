"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getNow, fmtStartsIn, fmtTime, greeting, parse } from "@/lib/dates"
import { getUser, currentUserId } from "@/lib/account"
import { useDemoData } from "@/lib/store/demo-store"
import { todaysAppointments } from "@/lib/selectors"
import { countByLevel, type AttentionSignal } from "@/lib/attention"

const piece = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A frase de abertura é uma leitura do escritório, não um contador. */
function statusLine(signals: AttentionSignal[], empty: boolean) {
  if (empty) return "Seu escritório está pronto. Comece cadastrando um cliente ou consultando um processo."
  const { critical, warning } = countByLevel(signals)
  const moved = signals.filter((s) => s.kind === "process-moved").reduce((acc, s) => acc + s.count, 0)
  const review = signals.filter((s) => s.kind === "process-moved" && s.level === "warning").reduce((acc, s) => acc + s.count, 0)
  const parts: string[] = []
  if (critical) parts.push(piece(critical, "ponto precisa de atenção hoje", "pontos precisam de atenção hoje"))
  else if (warning) parts.push(`Nada urgente · ${piece(warning, "ponto para verificar", "pontos para verificar")}`)
  else parts.push("Tudo em dia no escritório")
  if (moved) {
    const movement = piece(moved, "movimentação recente", "movimentações recentes")
    parts.push(review ? `${movement} · ${piece(review, "pode exigir atenção", "podem exigir atenção")}` : movement)
  }
  return parts.join(" · ")
}

export function Greeting({ signals, empty = false }: { signals: AttentionSignal[]; empty?: boolean }) {
  const data = useDemoData()
  const user = getUser(currentUserId())
  const next = todaysAppointments(data).find((a) => parse(a.start) > getNow())

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.025em] text-foreground sm:text-[36px]">
          {greeting()}, {user.firstName}.
        </h1>
        <p className="mt-2.5 text-[14.5px] text-muted-foreground">{statusLine(signals, empty)}</p>
      </div>
      {next && (
        <Link
          href="/agenda"
          className="group flex max-w-full items-center gap-3 self-start rounded-[12px] border border-border bg-card py-2.5 pr-3 pl-3.5 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/40 lg:self-auto"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/60" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          <span className="min-w-0 text-[13px]">
            <span className="text-muted-foreground">Próximo · {fmtStartsIn(next.start)}</span>
            <span className="block truncate font-medium text-foreground">
              {next.title}
              {next.personName && next.personName !== next.title ? ` com ${next.personName}` : ""} às {fmtTime(next.start)}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      )}
    </div>
  )
}
