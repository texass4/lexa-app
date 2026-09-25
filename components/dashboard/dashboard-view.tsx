"use client"

import { Greeting } from "./greeting"
import { KpiCards } from "./kpi-cards"
import { TodayAgenda } from "./today-agenda"
import { RecentActivity } from "./recent-activity"
import { MyTasks } from "./my-tasks"
import { RevenuePanel } from "./revenue-panel"
import { FadeIn } from "@/components/ui/motion"
import { Skeleton, SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { useDemoData } from "@/lib/store/demo-store"
import { useSession } from "@/lib/auth/session"

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <SkeletonStats />
      <div className="grid gap-4 lg:grid-cols-12">
        <SkeletonCard className="lg:col-span-8" lines={5} />
        <SkeletonCard className="lg:col-span-4" lines={5} />
      </div>
    </div>
  )
}

export function DashboardView() {
  const ready = useDemoData().hydrated
  const { can } = useSession()
  if (!ready) return <DashboardSkeleton />

  return (
    <div className="space-y-6 lg:space-y-7">
      <FadeIn>
        <Greeting />
      </FadeIn>
      <KpiCards />
      {/* No mobile as colunas viram "contents" para reordenar: agenda e tarefas primeiro. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-5">
        <div className="contents lg:col-span-8 lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="contents lg:grid lg:gap-5 xl:grid-cols-2">
            {can("tasks.view") && (
              <FadeIn delay={0.12} className="order-2 lg:order-none">
                <MyTasks />
              </FadeIn>
            )}
            <FadeIn delay={0.16} className="order-4 lg:order-none">
              <RecentActivity />
            </FadeIn>
          </div>
        </div>
        <div className="contents lg:col-span-4 lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          {can("agenda.view") && (
            <FadeIn delay={0.1} className="order-1 lg:order-none">
              <TodayAgenda />
            </FadeIn>
          )}
          {can("finance.view") && (
            <FadeIn delay={0.14} className="order-5 lg:order-none">
              <RevenuePanel />
            </FadeIn>
          )}
        </div>
      </div>
    </div>
  )
}
