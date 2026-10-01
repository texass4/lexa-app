"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isActive, visibleSections, type NavItem } from "./nav-config"
import { diffInDays, getNow, parse } from "@/lib/dates"
import { isOverdue } from "@/lib/selectors"
import { daysToDeadline } from "@/lib/attention"
import { useSession } from "@/lib/auth/session"
import { useDemoData } from "@/lib/store/demo-store"

/**
 * mode:
 *  - "expanded": sempre com rótulos (drawer mobile)
 *  - "auto": compacto entre 768–1023px e expandido a partir de 1024px
 *  - "collapsed": sempre compacto (usuário recolheu)
 */
export function SidebarNav({ mode, onNavigate, layoutId }: { mode: "expanded" | "auto" | "collapsed"; onNavigate?: () => void; layoutId: string }) {
  const pathname = usePathname()
  const data = useDemoData()
  const { can, user } = useSession()
  // Badges só quando pedem ação: suas tarefas atrasadas ou de hoje; prazos em até 3 dias.
  const now = getNow()
  const myDue = data.tasks.filter((t) => t.assigneeId === user.id && t.status === "pendente" && diffInDays(parse(t.dueAt), now) <= 0)
  const badges: Record<NonNullable<NavItem["badgeKey"]>, { count: number; urgent: boolean; label: string }> = {
    tasks: {
      count: myDue.length,
      urgent: myDue.some((t) => isOverdue(t, now)),
      label: "suas tarefas atrasadas ou para hoje",
    },
    processes: {
      count: data.processes.filter((p) => {
        const days = daysToDeadline(p, now)
        return days !== undefined && days <= 3
      }).length,
      urgent: true,
      label: "processos com prazo em até 3 dias",
    },
  }

  const labelCls = mode === "expanded" ? "" : mode === "auto" ? "hidden lg:block" : "hidden"
  const compactCls = mode === "expanded" ? "" : mode === "auto" ? "max-lg:justify-center max-lg:px-0" : "justify-center px-0"
  const tooltipCls = mode === "expanded" ? "hidden" : mode === "auto" ? "lg:hidden" : ""

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-6">
      {visibleSections(can).map((section) => (
        <div key={section.label}>
          <p className={cn("mb-2 px-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-sidebar-muted/70", labelCls)}>{section.label}</p>
          {mode !== "expanded" && <div className={cn("mx-auto mb-2 h-px w-6 bg-sidebar-border", mode === "auto" ? "lg:hidden" : "")} aria-hidden />}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              const badge = item.badgeKey && data.hydrated && badges[item.badgeKey].count > 0 ? badges[item.badgeKey] : undefined
              return (
                <li key={item.href}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          aria-label={badge ? `${item.label} — ${badge.count} ${badge.label}` : item.label}
                          className={cn(
                            "group relative flex h-10 items-center gap-3 rounded-control px-3 text-[13.5px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
                            active ? "text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
                            compactCls,
                          )}
                        />
                      }
                    >
                      {active && (
                        <motion.span
                          layoutId={layoutId}
                          transition={{ type: "spring", stiffness: 520, damping: 42 }}
                          className="absolute inset-0 rounded-control bg-white/[0.09] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]"
                        />
                      )}
                      <Icon
                        className={cn("relative size-[18px] shrink-0 transition-colors", active ? "text-sidebar-highlight" : "text-sidebar-muted group-hover:text-sidebar-foreground")}
                        strokeWidth={1.8}
                      />
                      <span className={cn("relative flex-1 truncate", labelCls)}>{item.label}</span>
                      {badge && (
                        <span
                          className={cn(
                            "relative tabular flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold",
                            badge.urgent ? "bg-[#e5484d]/20 text-[#ffb3ad]" : "bg-white/10 text-sidebar-foreground/85",
                            labelCls,
                          )}
                        >
                          {badge.count}
                        </span>
                      )}
                      {badge?.urgent && mode !== "expanded" && (
                        <span
                          aria-hidden
                          className={cn("absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#ff8a80]", mode === "auto" && "lg:hidden")}
                        />
                      )}
                      {active && (
                        <span aria-hidden className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-highlight" />
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10} className={tooltipCls}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
