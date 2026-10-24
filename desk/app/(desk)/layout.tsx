import { cookies } from "next/headers"
import { AppShell } from "@/components/shell/app-shell"
import { requireOwner } from "@/lib/auth/server"
import { getRequestContext } from "@/lib/context"
import { areaOptions } from "@/lib/services/areas"
import { countInbox } from "@/lib/services/inbox"
import { projectOptions } from "@/lib/services/projects"
import { countOpenTasks } from "@/lib/services/tasks"

// Dados pessoais: sempre lidos na hora, nunca pré-renderizados.
export const dynamic = "force-dynamic"

export default async function DeskLayout({ children }: LayoutProps<"/">) {
  await requireOwner()
  const ctx = await getRequestContext()
  const [projects, areas, inbox, taskCounts, store] = await Promise.all([projectOptions(), areaOptions(), countInbox(), countOpenTasks(ctx.today), cookies()])
  return (
    <AppShell
      initialCollapsed={store.get("mesa_nav")?.value === "collapsed"}
      data={{
        today: ctx.today,
        timezone: ctx.timezone,
        weekStartsOn: ctx.weekStartsOn,
        projects: projects.map((p) => ({ id: p.id, label: p.title, areaId: p.areaId })),
        areas: areas.map((a) => ({ id: a.id, label: a.name })),
        counts: { inbox, overdue: taskCounts.overdue, today: taskCounts.today },
      }}
    >
      {children}
    </AppShell>
  )
}
