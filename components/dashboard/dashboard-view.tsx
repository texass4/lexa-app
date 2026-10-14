"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "cn"
import { Greeting } from "./greeting"
import { KpiCards } from "./kpi-cards"
import { RecentProcesses } from "./recent-processes"
import { QuickViews } from "./quick-views"
import { TodayAgenda } from "./today-agenda"
import { OpenTasks } from "./open-tasks"
import { FinancePanel } from "./finance-panel"
import { WeekPrazos } from "./week-prazos"
import { ActivityFeed } from "./activity-feed"
import { AttentionPanel } from "./attention-panel"
import { FadeIn } from "@/components/ui/motion"
import { Skeleton, SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { Panel } from "@/components/ui/panel"
import { ErrorState } from "@/components/ui/empty-state"
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
/** `wide`: a coluna da esquerda ganha mais espaço (8 + 4), para a agenda e a tabela de processos. */
function Row({ left, right, delay = 0, wide = false }: { left?: React.ReactNode; right?: React.ReactNode; delay?: number; wide?: boolean }) {
  if (!left && !right) return null
  const both = !!left && !!right
  return (
    <div className="grid gap-4 @4xl/main:grid-cols-12 @4xl/main:gap-6">
      {left && (
        <FadeIn
          delay={delay}
          className={cn(
            "min-w-0",
            !wide && "[&>*]:h-full",
            both ? (wide ? "@4xl/main:col-span-7 @6xl/main:col-span-8" : "@4xl/main:col-span-7") : "@4xl/main:col-span-12",
          )}
        >
          {left}
        </FadeIn>
      )}
      {right && (
        <FadeIn
          delay={delay + 0.04}
          className={cn(
            "min-w-0",
            !wide && "[&>*]:h-full",
            both ? (wide ? "@4xl/main:col-span-5 @6xl/main:col-span-4" : "@4xl/main:col-span-5") : "@4xl/main:col-span-12",
          )}
        >
          {right}
        </FadeIn>
      )}
    </div>
  )
}

export function DashboardView() {
  const data = useOfficeData()
  const { retryLoad } = useOfficeActions()
  const { can, user } = useSession()
  // A lista do que merece atenção começa fechada (os cartões abaixo já mostram agenda,
  // tarefas e prazos); quem abrir, encontra aberta da próxima vez.
  const [insights, setInsights] = React.useState(() => {
    try {
      return localStorage.getItem(INSIGHTS_KEY) === "1"
    } catch {
      return false
    }
  })
  if (!data.hydrated && data.loadError)
    return (
      <Panel className="mt-4">
        <ErrorState title="Não foi possível carregar o painel." onRetry={retryLoad} />
      </Panel>
    )
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
        <Greeting signals={signals} empty={empty} attentionOpen={insights} onToggleAttention={toggleInsights} />
      </FadeIn>

      {!empty && (
        <FadeIn delay={0.02}>
          <KpiCards />
        </FadeIn>
      )}

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

      {/* Por prioridade: a agenda (protagonista) com as tarefas ao lado; depois processos, o que mudou e dinheiro. */}
      <Row left={can("agenda.view") && <TodayAgenda />} right={can("tasks.view") && <OpenTasks />} delay={0.06} wide />
      <Row left={can("processes.view") && <RecentProcesses />} right={<QuickViews />} delay={0.1} wide />
      <Row left={<ActivityFeed />} right={can("processes.view") && <WeekPrazos />} delay={0.14} />
      {can("finance.view") && (
        <FadeIn delay={0.16}>
          <FinancePanel />
        </FadeIn>
      )}
    </div>
  )
}
