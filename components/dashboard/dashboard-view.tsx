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

/**
 * Duas colunas lado a lado (7 + 5) a partir de 768 px de conteúdo — cabem ao lado do assistente
 * aberto, como na referência. Se a pessoa só pode ver um bloco, ele ocupa a linha.
 */
function Row({ left, right, delay = 0 }: { left?: React.ReactNode; right?: React.ReactNode; delay?: number }) {
  if (!left && !right) return null
  const both = !!left && !!right
  return (
    <div className="grid gap-4 @3xl/main:grid-cols-12 @5xl/main:gap-5">
      {left && (
        <FadeIn delay={delay} className={cn("min-w-0 [&>*]:h-full", both ? "@3xl/main:col-span-7" : "@3xl/main:col-span-12")}>
          {left}
        </FadeIn>
      )}
      {right && (
        <FadeIn delay={delay + 0.04} className={cn("min-w-0 [&>*]:h-full", both ? "@3xl/main:col-span-5" : "@3xl/main:col-span-12")}>
          {right}
        </FadeIn>
      )}
    </div>
  )
}

type Block = { node: React.ReactNode; order: string }

/**
 * Duas colunas que empilham por conta própria (como na referência: agenda e processos à
 * esquerda, tarefas e visualizações à direita) — uma agenda curta não deixa vão ao lado das
 * tarefas. Numa coluna só (celular), os blocos seguem a prioridade pelo `order`.
 */
function Columns({ left, right, delay = 0 }: { left: Block[]; right: Block[]; delay?: number }) {
  const l = left.filter((b) => b.node)
  const r = right.filter((b) => b.node)
  if (!l.length && !r.length) return null
  const both = l.length > 0 && r.length > 0
  const column = (blocks: Block[], span: string, extra: number) => (
    <div
      className={cn(
        "contents @3xl/main:flex @3xl/main:min-w-0 @3xl/main:flex-col @3xl/main:gap-4 @5xl/main:gap-5",
        both ? span : "@3xl/main:col-span-12",
      )}
    >
      {blocks.map((b, i) => (
        <FadeIn key={i} delay={delay + extra + i * 0.04} className={cn("min-w-0", b.order)}>
          {b.node}
        </FadeIn>
      ))}
    </div>
  )
  return (
    <div className="grid gap-4 @3xl/main:grid-cols-12 @3xl/main:items-start @5xl/main:gap-5">
      {l.length > 0 && column(l, "@3xl/main:col-span-7", 0)}
      {r.length > 0 && column(r, "@3xl/main:col-span-5", 0.04)}
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
    <div className="min-w-0 space-y-5">
      {/* Boas-vindas: saudação e indicadores sobre uma superfície clara com a ilustração do ambiente. */}
      <FadeIn>
        <section
          aria-label="Resumo do dia"
          className="relative -mx-1 overflow-hidden rounded-[16px] bg-[linear-gradient(180deg,#EEF3FA_0%,rgba(248,250,252,0)_92%)] px-4 pt-5 pb-1 sm:px-5 dark:bg-[linear-gradient(180deg,rgba(37,99,235,0.10)_0%,transparent_92%)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/ambiente-escritorio.svg"
            alt=""
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 hidden h-[188px] w-auto select-none [mask-image:linear-gradient(90deg,transparent,#000_35%)] @2xl/main:block dark:opacity-25"
          />
          <Greeting signals={signals} empty={empty} attentionOpen={insights} onToggleAttention={toggleInsights} />
          {!empty && (
            <div className="relative mt-6">
              <KpiCards />
            </div>
          )}
        </section>
      </FadeIn>

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
      <Columns
        delay={0.06}
        left={[
          { node: can("agenda.view") && <TodayAgenda />, order: "order-1" },
          { node: can("processes.view") && <RecentProcesses />, order: "order-3" },
        ]}
        right={[
          { node: can("tasks.view") && <OpenTasks />, order: "order-2" },
          { node: <QuickViews />, order: "order-4" },
        ]}
      />
      <Row left={<ActivityFeed />} right={can("processes.view") && <WeekPrazos />} delay={0.14} />
      {can("finance.view") && (
        <FadeIn delay={0.16}>
          <FinancePanel />
        </FadeIn>
      )}
    </div>
  )
}
