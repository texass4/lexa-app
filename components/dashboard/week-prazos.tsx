"use client"

import Link from "next/link"
import { ArrowRight, Hourglass, Plus } from "lucide-react"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { getUser } from "@/lib/account"
import { fmtDayMonth, fmtDueIn, getNow } from "@/lib/dates"
import { PRAZO_ALERT_DAYS } from "@/lib/attention"
import { daysToPrazo, prazoTask, weekPrazos } from "@/lib/prazos"
import { Can } from "@/lib/auth/session"

/** Prazos abertos que vencem até domingo (e os já vencidos), por responsável. */
export function WeekPrazos() {
  const { deadlines, processes, tasks } = useDemoData()
  const { openDialog } = useUI()
  const now = getNow()
  const groups = weekPrazos(deadlines, now)
  const total = groups.reduce((acc, g) => acc + g.prazos.length, 0)

  return (
    <Panel>
      <PanelHeader
        title="Prazos da semana"
        description={total ? `${total} ${total === 1 ? "prazo aberto" : "prazos abertos"} até domingo` : "Nenhum prazo aberto até domingo"}
        action={
          <>
            <Can permission="processes.edit">
              <Button variant="ghost" size="icon-sm" aria-label="Novo prazo" onClick={() => openDialog("prazo")}>
                <Plus />
              </Button>
            </Can>
            <Link
              href="/tarefas/prazos"
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              Ver todos <ArrowRight className="size-3.5" />
            </Link>
          </>
        }
      />
      {groups.length ? (
        <div className="space-y-4 px-5 pb-5">
          {groups.map((group) => {
            const owner = group.responsibleId ? getUser(group.responsibleId) : undefined
            return (
              <section key={group.responsibleId || "sem-responsavel"} aria-label={`Prazos de ${owner?.name ?? "sem responsável"}`}>
                <div className="flex items-center gap-2 pb-1.5">
                  {owner ? <UserAvatar name={owner.name} size="xs" /> : null}
                  <span className="text-[12.5px] font-semibold text-foreground">{owner?.name ?? "Sem responsável"}</span>
                  <span className="text-[12px] text-subtle">{group.prazos.length}</span>
                </div>
                <ul className="divide-y divide-border rounded-[12px] border border-border">
                  {group.prazos.map((prazo) => {
                    const process = processes.find((p) => p.id === prazo.processId)
                    const urgent = daysToPrazo(prazo, now) <= PRAZO_ALERT_DAYS.soon
                    return (
                      <li key={prazo.id}>
                        <Link
                          href={`/processos/${prazo.processId}`}
                          className="flex items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-brand/40"
                        >
                          <Hourglass className={cn("size-4 shrink-0", urgent ? "text-danger" : "text-subtle")} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">{prazo.description}</span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {process ? `Processo ${process.code}` : "Processo"}
                              {!prazoTask(prazo, tasks) && <span className="font-medium text-warning"> · sem tarefa</span>}
                            </span>
                          </span>
                          <span className={cn("shrink-0 text-right text-[12px]", urgent ? "font-medium text-danger" : "text-muted-foreground")}>
                            <span className="tabular block">{fmtDayMonth(prazo.fatalDate)}</span>
                            <span className="block">{fmtDueIn(prazo.fatalDate, now)}</span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-muted-foreground">Nenhum prazo aberto vence até domingo.</p>
      )}
    </Panel>
  )
}
