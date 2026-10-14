"use client"

import * as React from "react"
import { Activity } from "lucide-react"
import { Panel } from "@/components/ui/panel"
import { useSession } from "@/lib/auth/session"
import { ChipTabs } from "./chip-tabs"
import { PanelLink } from "./panel-link"
import { RecentActivity } from "./recent-activity"
import { RecentMovements } from "./recent-movements"

type Feed = "escritorio" | "processos"

/** O que mudou: o que a equipe fez e o que andou nos processos — um painel, duas abas. */
export function ActivityFeed() {
  const { can } = useSession()
  const withProcesses = can("processes.view")
  const [feed, setFeed] = React.useState<Feed>("escritorio")
  const current = withProcesses ? feed : "escritorio"
  return (
    <Panel className="flex flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em] text-foreground">
          <Activity className="size-[17px] text-foreground/75" /> O que mudou
        </h2>
        {current === "processos" && <PanelLink href="/processos">Ver processos</PanelLink>}
      </header>
      {withProcesses && (
        <ChipTabs
          ariaLabel="Tipo de atividade"
          className="px-5 pt-3 pb-2 sm:px-6"
          value={current}
          onChange={setFeed}
          tabs={[
            { value: "escritorio", label: "Equipe" },
            { value: "processos", label: "Movimentações processuais" },
          ]}
        />
      )}
      <div role="tabpanel" className="flex-1 pt-1">
        {current === "escritorio" ? <RecentActivity embedded /> : <RecentMovements embedded />}
      </div>
    </Panel>
  )
}
