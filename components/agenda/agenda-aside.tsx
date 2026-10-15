"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, CalendarClock, Copy, Search, Sparkles, UserRound, Video } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { AvatarStack } from "./avatar-stack"
import { eventTone } from "./event-style"
import { officeContext } from "@/components/ai/ai-context"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { availabilityText, isPlanned, participantsOf, videoProvider } from "@/lib/agenda/agenda"
import { currentUserId } from "@/lib/auth/account"
import { useSession } from "@/lib/auth/session"
import { fmtDayLabel, fmtStartsIn, fmtTime, getNow, parse, toLocalISO } from "@/lib/core/dates"
import { matches } from "@/lib/core/format"
import { processSubject } from "@/lib/processos/label"
import { byId } from "@/lib/store/indexes"
import { useOfficeData } from "@/lib/store/office-store"
import { useUI } from "@/lib/store/ui-store"
import type { Appointment } from "@/types"

const SHORTCUTS: [string, string][] = [
  ["N", "Novo compromisso"],
  ["T", "Ir para hoje"],
  ["D · S · M · L", "Dia, semana, mês, lista"],
  ["← →", "Período anterior e próximo"],
]

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 border-b border-border/80 px-4 py-4 last:border-0">
      <h2 className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{title}</h2>
      {children}
    </section>
  )
}

/** Quem vem a seguir no escritório: o próximo compromisso planejado, com atalho para a videochamada. */
function NextUp({ next, colorOf }: { next?: Appointment; colorOf: (a: Appointment) => string | undefined }) {
  const data = useOfficeData()
  const { can } = useSession()
  if (!next) return <p className="text-[13px] text-muted-foreground">Nenhum compromisso pela frente.</p>
  const now = getNow()
  const tone = eventTone(colorOf(next))
  const client = byId(data.clients, next.clientId)
  const process = byId(data.processes, next.processId)
  const live = parse(next.start) <= now
  return (
    <div className="overflow-hidden rounded-[10px] border-l-[4px] px-3 py-2.5" style={{ ...tone.card, ...tone.bar }}>
      <p className="text-[11.5px] text-muted-foreground">
        {live ? "Agora" : fmtStartsIn(next.start, now).replace(/^em /, "Em ")} · {fmtDayLabel(next.start)},{" "}
        <span className="tabular">{fmtTime(next.start)}</span>
      </p>
      <p className="mt-0.5 text-[14px] leading-snug font-semibold" style={tone.text}>
        {next.title}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
        {client && can("clients.view") && (
          <Link
            href={`/clientes/${client.id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            {client.name} <ArrowUpRight className="size-3" />
          </Link>
        )}
        {process && can("processes.view") && (
          <Link
            href={`/processos/${process.id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            {client ? processSubject(process) : process.code} <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <AvatarStack ids={participantsOf(next)} size="sm" max={4} />
        {next.videoUrl && (
          <a
            href={next.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 text-[12px] font-medium text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Video className="size-3.5" /> Conectar
            <span className="sr-only"> ({videoProvider(next.videoUrl)})</span>
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * Painel à direita da Agenda: o próximo compromisso, horários livres para mandar ao
 * cliente, reunião rápida (com um cliente) e os atalhos de teclado.
 */
export function AgendaAside({
  editable,
  colorOf,
  className,
}: {
  editable: boolean
  colorOf: (a: Appointment) => string | undefined
  /** Quando o painel aparece (depende da largura e da preferência). */
  className?: string
}) {
  const data = useOfficeData()
  const lexa = useLexaAI()
  const { openDialog } = useUI()
  const [query, setQuery] = React.useState("")
  const now = getNow()
  const upcoming = data.appointments.filter((a) => isPlanned(a) && parse(a.end) > now).sort((a, b) => a.start.localeCompare(b.start))
  const todayLeft = upcoming.filter((a) => a.start.slice(0, 10) === toLocalISO(now).slice(0, 10)).length
  const suggestions = query.trim() ? data.clients.filter((c) => matches(query, c.name)).slice(0, 5) : []

  const shareAvailability = async () => {
    const text = availabilityText(data.appointments, currentUserId(), toLocalISO(now).slice(0, 10), 5, now)
    if (!text) {
      toast("Sem horários livres nos próximos dias úteis.")
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Horários copiados.", { description: "Cole na conversa com o cliente. Considera 9h–18h e os seus compromissos." })
    } catch {
      toast.error("Não foi possível copiar.", { description: "Permita o acesso à área de transferência e tente de novo." })
    }
  }

  const quick = (client: { id: string; name: string }) => {
    const minutes = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15
    const time = `${String(Math.min(23, Math.floor(minutes / 60))).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    setQuery("")
    openDialog("appointment", { clientId: client.id, title: `Reunião com ${client.name.split(" ")[0]}`, date: toLocalISO(now).slice(0, 10), time })
  }

  return (
    <aside aria-label="Resumo da agenda" className={cn("hidden self-start rounded-card border border-border/90 bg-card shadow-card", className)}>
      <Block title="Próximo compromisso">
        <NextUp next={upcoming[0]} colorOf={colorOf} />
        <p className="text-[12px] text-muted-foreground">
          {todayLeft === 0 ? "Nada mais para hoje." : todayLeft === 1 ? "1 compromisso restante hoje." : `${todayLeft} compromissos restantes hoje.`}
        </p>
        <button
          type="button"
          onClick={() => lexa.ask("Quais compromissos exigem preparação?", officeContext("agenda"))}
          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-brand/25 bg-brand-soft/60 px-3 text-[12.5px] font-medium text-brand-strong outline-none transition-[border-color,background-color] hover:border-brand/50 hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Sparkles className="size-3.5" /> O que exige preparação?
        </button>
      </Block>

      <Block title="Horários livres">
        <Button variant="secondary" className="w-full justify-between" onClick={shareAvailability}>
          <span className="inline-flex items-center gap-2">
            <CalendarClock /> Compartilhar disponibilidade
          </span>
          <Copy className="text-subtle" />
        </Button>
        <p className="text-[11.5px] leading-relaxed text-subtle">Copia os seus horários livres dos próximos dias úteis para enviar ao cliente.</p>
      </Block>

      {editable && (
        <Block title="Reunião rápida">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Reunir com…"
              aria-label="Reunir com cliente"
              className="h-9 w-full rounded-control border border-border bg-surface pr-3 pl-8 text-[13px] outline-none placeholder:text-subtle focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
            />
          </div>
          {suggestions.length > 0 && (
            <ul className="space-y-0.5">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => quick(c)}
                    className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <UserRound className="size-3.5 text-subtle" /> <span className="truncate">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && suggestions.length === 0 && <p className="text-[12px] text-muted-foreground">Nenhum cliente com esse nome.</p>}
        </Block>
      )}

      <Block title="Atalhos úteis">
        <ul className="space-y-1.5">
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
              {label}
              <Kbd>{keys}</Kbd>
            </li>
          ))}
        </ul>
      </Block>
    </aside>
  )
}
