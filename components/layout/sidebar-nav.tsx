"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { cn } from "cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isActive, visibleSections, type NavItem } from "./nav-config"
import { diffInDays, getNow, parse } from "@/lib/dates"
import { isOverdue } from "@/lib/selectors"
import { PRAZO_ALERT_DAYS, isActiveProcess } from "@/lib/attention"
import { daysToPrazo, isOpenPrazo, nextPrazo } from "@/lib/prazos"
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
  // Itens com telas internas abertos pela setinha (ex.: Tarefas › Prazos).
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set())
  // Badges só quando pedem ação: suas tarefas atrasadas ou de hoje; prazos abertos em até 2 dias.
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
        const next = isActiveProcess(p) ? nextPrazo(data.deadlines, p.id) : undefined
        return next !== undefined && daysToPrazo(next, now) <= PRAZO_ALERT_DAYS.soon
      }).length,
      urgent: true,
      label: `processos com prazo em até ${PRAZO_ALERT_DAYS.soon} dias`,
    },
    prazos: {
      count: data.deadlines.filter((p) => isOpenPrazo(p) && daysToPrazo(p, now) <= PRAZO_ALERT_DAYS.soon).length,
      urgent: true,
      label: `prazos abertos vencidos ou em até ${PRAZO_ALERT_DAYS.soon} dias`,
    },
  }

  const labelCls = mode === "expanded" ? "" : mode === "auto" ? "hidden lg:block" : "hidden"
  const compactCls = mode === "expanded" ? "" : mode === "auto" ? "max-lg:justify-center max-lg:px-0" : "justify-center px-0"
  const tooltipCls = mode === "expanded" ? "hidden" : mode === "auto" ? "lg:hidden" : ""
  // Recuo das telas internas só com rótulos (no modo compacto viram ícones como os outros).
  const childCls = mode === "expanded" ? "pl-8" : mode === "auto" ? "lg:pl-8" : ""
  // A setinha só existe com rótulos.
  const toggleCls = mode === "expanded" ? "flex" : mode === "auto" ? "hidden lg:flex" : "hidden"

  const renderLink = (item: NavItem, active: boolean, child = false) => {
    const Icon = item.icon
    const badge = item.badgeKey && data.hydrated && badges[item.badgeKey].count > 0 ? badges[item.badgeKey] : undefined
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={badge ? `${item.label} — ${badge.count} ${badge.label}` : item.label}
              className={cn(
                "group relative flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                active ? "text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                compactCls,
                child && cn("h-8 text-[13px]", childCls),
              )}
            />
          }
        >
          {active && (
            <motion.span
              layoutId={layoutId}
              transition={{ type: "spring", stiffness: 520, damping: 42 }}
              className="absolute inset-0 rounded-[9px] border border-border bg-sidebar-accent shadow-xs"
            />
          )}
          <Icon
            className={cn("relative size-[17px] shrink-0", active ? "text-foreground" : "text-subtle group-hover:text-foreground", child && "size-4")}
            strokeWidth={1.8}
          />
          <span className={cn("relative flex-1 truncate", labelCls)}>{item.label}</span>
          {badge && (
            <span
              className={cn(
                "relative tabular flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold",
                badge.urgent ? "bg-danger-soft text-danger" : "bg-surface-muted text-muted-foreground",
                labelCls,
              )}
            >
              {badge.count}
            </span>
          )}
          {badge?.urgent && mode !== "expanded" && (
            <span aria-hidden className={cn("absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger", mode === "auto" && "lg:hidden")} />
          )}
          {active && <span aria-hidden className="absolute top-1/2 -left-3 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand max-md:hidden" />}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className={tooltipCls}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      {visibleSections(can).map((section) => (
        <div key={section.label}>
          <p className={cn("mb-1.5 px-2.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-subtle", labelCls)}>{section.label}</p>
          {mode !== "expanded" && <div className={cn("mx-auto mb-2 h-px w-6 bg-border", mode === "auto" ? "lg:hidden" : "")} aria-hidden />}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const children = item.children ?? []
              const childActive = children.some((c) => isActive(pathname, c.href))
              const groupOpen = childActive || open.has(item.href)
              // Com rótulos, as telas internas aparecem pela setinha; só com ícones, ficam sempre à mostra.
              const childVisibility = mode === "collapsed" ? "" : groupOpen ? "" : mode === "auto" ? "lg:hidden" : "hidden"
              return (
                <li key={item.href}>
                  <div className="flex items-center gap-0.5">
                    {renderLink(item, isActive(pathname, item.href) && !childActive)}
                    {children.length > 0 && (
                      <button
                        type="button"
                        aria-expanded={groupOpen}
                        aria-controls={`nav-${item.href.slice(1)}`}
                        aria-label={`${groupOpen ? "Esconder" : "Mostrar"} telas de ${item.label}`}
                        onClick={() =>
                          setOpen((current) => {
                            const next = new Set(current)
                            if (next.has(item.href)) next.delete(item.href)
                            else next.add(item.href)
                            return next
                          })
                        }
                        disabled={childActive}
                        className={cn(
                          "size-7 shrink-0 items-center justify-center rounded-[7px] text-subtle outline-none transition-colors hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60",
                          toggleCls,
                        )}
                      >
                        <ChevronRight className={cn("size-3.5 transition-transform", groupOpen && "rotate-90")} />
                      </button>
                    )}
                  </div>
                  {children.length > 0 && (
                    <ul
                      id={`nav-${item.href.slice(1)}`}
                      className={cn("mt-0.5 flex-col gap-0.5", childVisibility === "hidden" ? "hidden" : cn("flex", childVisibility))}
                    >
                      {children.map((c) => (
                        <li key={c.href} className="flex">
                          {renderLink(c, isActive(pathname, c.href), true)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
