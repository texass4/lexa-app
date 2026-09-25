"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { ActivityIcon } from "@/components/shared/activity-icon"
import { EmptyState } from "@/components/ui/empty-state"
import { useDemoData } from "@/lib/store/demo-store"
import { fmtActivityTime } from "@/lib/dates"

export function RecentActivity({ limit = 7 }: { limit?: number }) {
  const { activities } = useDemoData()
  const items = activities.slice(0, limit)

  return (
    <Panel>
      <PanelHeader title="Atividade recente" description="Movimentações do escritório" />
      {items.length === 0 && <EmptyState compact title="Nenhuma atividade ainda." description="Cadastros, tarefas e consultas aparecem aqui." />}
      <ol className={items.length ? "relative px-5 pb-4" : "hidden"}>
        <span aria-hidden className="absolute top-3 bottom-7 left-[33px] w-px bg-border" />
        <AnimatePresence initial={false}>
          {items.map((a) => (
            <motion.li
              key={a.id}
              layout
              initial={{ opacity: 0, y: -6, backgroundColor: "rgba(168,134,85,0.14)" }}
              animate={{ opacity: 1, y: 0, backgroundColor: "rgba(168,134,85,0)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], backgroundColor: { duration: 1.6 } }}
              className="-mx-2 rounded-[10px]"
            >
              <Link
                href={a.href ?? "#"}
                className="group flex gap-3 rounded-[10px] px-2 py-2 outline-none transition-colors hover:bg-accent/70 focus-visible:bg-accent"
              >
                <ActivityIcon type={a.type} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[13px] leading-snug text-foreground">
                    {a.actor && <span className="font-semibold">{a.actor} </span>}
                    <span className={a.actor ? "text-foreground/85" : ""}>{a.message}</span>
                  </p>
                  {a.detail && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{a.detail}</p>}
                </div>
                <span className="tabular shrink-0 pt-0.5 text-[11.5px] text-subtle">{fmtActivityTime(a.at)}</span>
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </Panel>
  )
}
