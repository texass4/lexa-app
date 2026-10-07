"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "cn"
import { Greeting } from "./greeting"
import { InsightBanner } from "./insight-banner"
import { KpiStrip } from "./kpi-cards"
import { RecentMovements } from "./recent-movements"
import { TodayAgenda } from "./today-agenda"
import { OpenTasks } from "./open-tasks"
import { FinancePanel } from "./finance-panel"
import { WeekPrazos } from "./week-prazos"
import { RecentActivity } from "./recent-activity"
import { AttentionPanel } from "./attention-panel"
import { FadeIn } from "@/components/ui/motion"
import { Skeleton, SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { useOfficeData } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import { officeSignals } from "@/lib/dashboard/attention"

const INSIGHTS_KEY = "lexa:dashboard:insights"

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
      <div className="space-y-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <SkeletonStats />
      <Skeleton className="h-[104px] w-full rounded-card" />
      <div className="grid gap-4 @4xl/main:grid-cols-12">
        <SkeletonCard className="@4xl/main:col-span-7" lines={4} />
        <SkeletonCard className="@4xl/main:col-span-5" lines={4} />
      </div>
    </div>
  )
}

/** Dois cartões lado a lado (7 + 5 colunas), com a mesma altura; se a pessoa só pode ver um, ele ocupa a linha. */
function Row({ left, right, delay = 0 }: { left?: React.ReactNode; right?: React.ReactNode; delay?: number }) {
  if (!left && !right) return null
  const both = !!left && !!right
  return (
    <div className="grid gap-4 @4xl/main:grid-cols-12 @4xl/main:gap-6">
      {left && (
        <FadeIn delay={delay} className={cn("min-w-0 [&>*]:h-full", both ? "@4xl/main:col-span-7" : "@4xl/main:col-span-12")}>
          {left}
        </FadeIn>
      )}
      {right && (
        <FadeIn delay={delay + 0.04} className={cn("min-w-0 [&>*]:h-full", both ? "@4xl/main:col-span-5" : "@4xl/main:col-span-12")}>
          {right}
        </FadeIn>
      )}
    </div>
  )
}

export function DashboardView() {
  const data = useOfficeData()
  const { can, user } = useSession()
  // A lista do que merece atenção começa aberta: é a resposta principal do Painel.
  // Quem fechar, encontra fechada da próxima vez.
  const [insights, setInsights] = React.useState(() => {
    try {
      return localStorage.getItem(INSIGHTS_KEY) !== "0"
    } catch {
      return true
    }
  })
  if (!data.hydrated) return <DashboardSkeleton />

  const signals = officeSignals(data, { userId: user.id, can })
  const empty = data.processes.length === 0 && data.tasks.length === 0 && data.clients.length === 0
  const toggleInsights = () =>
    setInsights((open) => {
      try {
        localStorage.setItem(INSIGHTS_KEY, open ? "0" : "1")
      } catch {
        // Preferência só local.
      }
      return !open
    })

  return (
    <div className="min-w-0 space-y-6">
      <FadeIn>
        <Greeting signals={signals} empty={empty} />
      </FadeIn>

      {!empty && (
        <FadeIn delay={0.02}>
          <KpiStrip />
        </FadeIn>
      )}

      <FadeIn delay={0.04} className="space-y-4">
        <InsightBanner expanded={insights} onToggle={toggleInsights} />
        <AnimatePresence initial={false}>
          {insights && (
            <motion.div
              id="painel-atencao"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <AttentionPanel signals={signals} empty={empty} />
            </motion.div>
          )}
        </AnimatePresence>
      </FadeIn>

      {/* Do mais urgente ao contexto: prazos e agenda, trabalho do dia, depois o que mudou. */}
      <Row left={can("processes.view") && <WeekPrazos />} right={can("agenda.view") && <TodayAgenda />} delay={0.08} />
      <Row left={can("tasks.view") && <OpenTasks />} right={can("finance.view") && <FinancePanel />} delay={0.12} />
      <Row left={can("processes.view") && <RecentMovements />} right={<RecentActivity />} delay={0.16} />
    </div>
  )
}
