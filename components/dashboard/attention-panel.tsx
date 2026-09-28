"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronDown, History, Plus } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { SignalDot, SignalList } from "@/components/shared/signal-list"
import { useDemoData } from "@/lib/store/demo-store"
import { useSession } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"
import { changesSince, countByLevel, type AttentionSignal } from "@/lib/attention"
import { acknowledgeVisit, readVisitBaseline } from "@/lib/visits"
import { fmtActivityTime, fmtRelative, getNow, toLocalISO } from "@/lib/dates"

/** Quantos sinais aparecem antes de "Ver todos" — pouca coisa competindo pela atenção. */
const VISIBLE = 5
const CHANGES_VISIBLE = 3

function SinceLastVisit() {
  const data = useDemoData()
  const { user, can } = useSession()
  // Lida uma vez: a base da sessão não muda enquanto a tela está aberta.
  const [baseline, setBaseline] = React.useState(() => readVisitBaseline(user.id))
  const [expanded, setExpanded] = React.useState(false)
  if (!baseline) return null

  const changes = changesSince(data, baseline, { userId: user.id, can })
  const since = fmtRelative(toLocalISO(baseline))

  if (!changes.length) {
    return (
      <p className="flex items-center gap-2 border-b border-border px-5 pb-3 text-[12.5px] text-subtle">
        <History className="size-3.5" /> Nada mudou desde sua última visita ({since}).
      </p>
    )
  }

  const shown = expanded ? changes : changes.slice(0, CHANGES_VISIBLE)

  return (
    <section aria-label="Desde sua última visita" className="mx-3 mb-3 rounded-[12px] border border-gold/20 bg-gold-soft/40 px-3 pt-3 pb-2">
      <header className="flex items-center justify-between gap-3 px-1">
        <p className="text-[12.5px] text-muted-foreground">
          <span className="font-semibold text-foreground">{changes.length === 1 ? "1 coisa mudou" : `${changes.length} coisas mudaram`}</span> desde
          sua última visita · {since}
        </p>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            const now = getNow()
            acknowledgeVisit(user.id, now)
            setBaseline(now)
          }}
        >
          <Check /> Entendi
        </Button>
      </header>
      <ul className="mt-1.5">
        <AnimatePresence initial={false}>
          {shown.map((change) => {
            const body = (
              <>
                <SignalDot level={change.level} className="mt-[7px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground">{change.text}</span>
                  {change.detail && <span className="block truncate text-[12px] text-muted-foreground">{change.detail}</span>}
                </span>
                <span className="tabular shrink-0 pt-0.5 text-[11.5px] text-subtle">{fmtActivityTime(change.at)}</span>
              </>
            )
            return (
              <motion.li
                key={change.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {change.href ? (
                  <Link
                    href={change.href}
                    className="flex items-start gap-3 rounded-[8px] px-1 py-1.5 outline-none transition-colors hover:bg-surface/70 focus-visible:ring-2 focus-visible:ring-gold/40"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-1 py-1.5">{body}</div>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      {changes.length > CHANGES_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-0.5 flex items-center gap-1 rounded-md px-1 py-1 text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          {expanded ? "Mostrar menos" : `Ver mais ${changes.length - CHANGES_VISIBLE}`}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </section>
  )
}

/**
 * "O que merece sua atenção?" — o primeiro painel do escritório. Sinais
 * calculados dos dados reais, do urgente ao informativo, cada um com o próximo passo.
 */
export function AttentionPanel({
  signals,
  empty,
}: {
  signals: AttentionSignal[]
  /** Escritório sem processos nem tarefas ainda. */ empty?: boolean
}) {
  const { openDialog } = useUI()
  const { can } = useSession()
  const [showAll, setShowAll] = React.useState(false)
  const counts = countByLevel(signals)
  const shown = showAll ? signals : signals.slice(0, VISIBLE)
  const description = signals.length
    ? [
        counts.critical && `${counts.critical} urgente${counts.critical > 1 ? "s" : ""}`,
        counts.warning && `${counts.warning} para verificar`,
        counts.info && `${counts.info} informativo${counts.info > 1 ? "s" : ""}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Prazos, tarefas e movimentações aparecem aqui quando precisarem de você."

  return (
    <Panel>
      <PanelHeader title="O que merece sua atenção" description={description} />
      <SinceLastVisit />
      {signals.length ? (
        <div className="px-3 pb-3">
          <SignalList signals={shown} />
          {signals.length > VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              {showAll ? "Mostrar só o principal" : `Ver todos (${signals.length})`}
              <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
            </button>
          )}
        </div>
      ) : empty ? (
        <div className="px-5 pb-5">
          <p className="max-w-lg text-[13px] leading-relaxed text-muted-foreground">
            Seu escritório ainda não tem processos nem tarefas. Quando você adicionar, a LEXA acompanha prazos e movimentações e destaca aqui o que
            merece atenção.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {can("processes.edit") && (
              <Button size="sm" onClick={() => openDialog("process")}>
                <Plus /> Adicionar processo
              </Button>
            )}
            {can("clients.edit") && (
              <Button size="sm" variant="secondary" onClick={() => openDialog("client")}>
                <Plus /> Cadastrar cliente
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-5 pb-5">
          <span className="flex size-8 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-4" />
          </span>
          <p className="text-[13px] text-muted-foreground">Tudo em dia: nenhum prazo próximo, atraso ou pendência nos dados do escritório.</p>
        </div>
      )}
    </Panel>
  )
}
