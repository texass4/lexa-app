"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getNow, fmtStartsIn, fmtTime, greeting, parse } from "@/lib/dates"
import { getUser, currentUserId } from "@/lib/account"
import { useDemoData } from "@/lib/store/demo-store"
import { todaysAppointments } from "@/lib/selectors"
import { countByLevel, type AttentionSignal } from "@/lib/attention"

/** A frase de abertura responde "como está meu escritório?" com os sinais reais. */
function statusLine(signals: AttentionSignal[], empty: boolean) {
  if (empty) return "Seu escritório está pronto. Comece cadastrando um cliente ou consultando um processo."
  const { critical, warning } = countByLevel(signals)
  if (critical) return `${critical === 1 ? "1 ponto precisa" : `${critical} pontos precisam`} da sua atenção hoje.`
  if (warning) return `Nada urgente agora. ${warning === 1 ? "1 ponto" : `${warning} pontos`} para verificar.`
  return "Tudo em dia no escritório."
}

export function Greeting({ signals, empty = false }: { signals: AttentionSignal[]; empty?: boolean }) {
  const data = useDemoData()
  const user = getUser(currentUserId())
  const next = todaysAppointments(data).find((a) => parse(a.start) > getNow())

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.01em] text-foreground sm:text-[42px]">
          {greeting()}, {user.firstName}.
        </h1>
        <p className="mt-2.5 text-[14.5px] text-muted-foreground">{statusLine(signals, empty)}</p>
      </div>
      {next && (
        <Link
          href="/agenda"
          className="group flex max-w-full items-center gap-3 self-start rounded-[12px] border border-border bg-card py-2.5 pr-3 pl-3.5 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong focus-visible:ring-2 focus-visible:ring-gold/40 lg:self-auto"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold/60" />
            <span className="relative inline-flex size-2 rounded-full bg-gold" />
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
