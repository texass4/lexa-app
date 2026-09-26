"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight, ListChecks } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { useUI } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"
import { LEVEL_LABEL, type AttentionSignal, type SignalLevel } from "@/lib/attention"

const DOT: Record<SignalLevel, string> = {
  critical: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  done: "bg-success",
}

export function SignalDot({ level, className }: { level: SignalLevel; className?: string }) {
  return (
    <span className={cn("relative flex size-2 shrink-0", className)} role="img" aria-label={LEVEL_LABEL[level]}>
      {level === "critical" && <span className="absolute inset-0 rounded-full bg-danger/25 ring-4 ring-danger/10" aria-hidden />}
      <span className={cn("relative size-2 rounded-full", DOT[level])} />
    </span>
  )
}

/** Abre o formulário de tarefa preenchido a partir do sinal — nada é salvo sem confirmação. */
export function useSignalAction() {
  const { openDialog } = useUI()
  const { can } = useSession()
  return (signal: AttentionSignal) => {
    const action = signal.action
    if (action?.type !== "create-task" || !can("tasks.edit")) return undefined
    return () => openDialog("task", { processId: action.processId, clientId: action.processId ? undefined : action.clientId, title: action.title })
  }
}

function SignalText({ signal }: { signal: AttentionSignal }) {
  return (
    <>
      <span className="block truncate text-[13.5px] font-medium text-foreground">{signal.title}</span>
      {signal.detail && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{signal.detail}</span>}
    </>
  )
}

/**
 * Lista de "o que merece atenção": frase curta, contexto e o próximo passo.
 * Cada linha leva ao registro real; "Criar tarefa" transforma o sinal em trabalho.
 */
export function SignalList({
  signals,
  className,
  dense,
  linked = true,
}: {
  signals: AttentionSignal[]
  className?: string
  dense?: boolean
  /** `false` quando a lista já está na página do registro (o link levaria à mesma tela). */
  linked?: boolean
}) {
  const actionFor = useSignalAction()
  return (
    <ul className={cn("space-y-0.5", className)}>
      <AnimatePresence initial={false}>
        {signals.map((signal) => {
          const act = actionFor(signal)
          return (
            <motion.li
              key={signal.id}
              layout="position"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn("group relative flex items-center gap-3 rounded-[10px] px-2 transition-colors", linked && "hover:bg-accent/60")}
            >
              <SignalDot level={signal.level} />
              {linked ? (
                <Link
                  href={signal.href}
                  className={cn(
                    "min-w-0 flex-1 outline-none after:absolute after:inset-0 after:rounded-[10px] focus-visible:after:ring-2 focus-visible:after:ring-gold/40",
                    dense ? "py-1.5" : "py-2.5",
                  )}
                >
                  <SignalText signal={signal} />
                </Link>
              ) : (
                <div className={cn("min-w-0 flex-1", dense ? "py-1.5" : "py-2.5")}>
                  <SignalText signal={signal} />
                </div>
              )}
              {act && signal.action && (
                <Button variant="secondary" size="xs" onClick={act} className={cn("relative z-[1] shrink-0", linked && "max-sm:hidden")}>
                  <ListChecks /> {signal.action.label}
                </Button>
              )}
              {linked && (
                <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              )}
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
