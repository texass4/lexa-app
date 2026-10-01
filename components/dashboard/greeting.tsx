"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getNow, fmtFullDate, fmtStartsIn, fmtTime, greeting, parse } from "@/lib/dates"
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
        {/* O painel só renderiza depois da hidratação, então a data do navegador é segura aqui. */}
        <p className="text-[11.5px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{fmtFullDate(getNow())}</p>
        <h1 className="mt-2.5 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-foreground sm:text-[38px]">
          {greeting()}, <span className="text-gold">{user.firstName}</span>.
        </h1>
        <p className="mt-2.5 text-[15px] text-muted-foreground">{statusLine(signals, empty)}</p>
      </div>
      {next && (
        <Link
          href="/agenda"
          className="group flex max-w-full items-center gap-3 self-start rounded-[14px] border border-border/90 bg-card py-3 pr-3.5 pl-4 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised focus-visible:ring-2 focus-visible:ring-brand/40 lg:self-auto"
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
