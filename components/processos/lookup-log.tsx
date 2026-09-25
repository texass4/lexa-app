"use client"

import * as React from "react"
import { describeEvent, type EventTone, type LookupEvent } from "@/lib/services/processes/lookup-events"

export interface LogEntry {
  id: number
  /** Segundos desde o início da consulta. */
  elapsed: number
  text: string
  tone: EventTone
}

const TONE_DOT: Record<EventTone, string> = {
  info: "bg-border-strong",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
}

const TONE_TEXT: Record<EventTone, string> = {
  info: "text-muted-foreground",
  success: "text-foreground",
  warning: "text-warning",
  danger: "text-danger",
}

/** Log da consulta: cada tentativa, 429, resposta parcial e timeout, ao vivo. */
export function LookupLog({ entries, className = "" }: { entries: LogEntry[]; className?: string }) {
  const ref = React.useRef<HTMLOListElement>(null)
  React.useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [entries.length])

  if (!entries.length) return null
  return (
    <ol
      ref={ref}
      aria-live="polite"
      className={`max-h-40 space-y-1.5 overflow-y-auto rounded-[10px] border border-border bg-surface px-3 py-2.5 font-mono text-[11.5px] leading-snug ${className}`}
    >
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-2">
          <span className="w-10 shrink-0 text-right tabular-nums text-subtle">{entry.elapsed.toFixed(1)}s</span>
          <span className={`mt-[5px] size-1.5 shrink-0 rounded-full ${TONE_DOT[entry.tone]}`} aria-hidden />
          <span className={`min-w-0 break-words ${TONE_TEXT[entry.tone]}`}>{entry.text}</span>
        </li>
      ))}
    </ol>
  )
}

/** Segundos desde `since`, atualizado a cada segundo enquanto `active`. */
export function useElapsed(since: number | null, active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0
}

/** Transforma eventos da consulta em linhas de log, com o tempo relativo ao início. */
export function makeLogAppender(started: number, push: (entry: LogEntry) => void) {
  let nextId = 0
  return (event: LookupEvent) => {
    const { text, tone } = describeEvent(event)
    push({ id: nextId++, elapsed: (Date.now() - started) / 1000, text, tone })
  }
}
