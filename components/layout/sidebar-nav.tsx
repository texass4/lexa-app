"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isActive, visibleSections, type NavItem } from "./nav-config"
import { diffInDays, getNow, isSameDay, parse } from "@/lib/core/dates"
import { isOverdue } from "@/lib/store/selectors"
import { PRAZO_ALERT_DAYS, isActiveProcess } from "@/lib/dashboard/attention"
import { daysToPrazo, isOpenPrazo, nextPrazo } from "@/lib/prazos/prazos"
import { useSession } from "@/lib/auth/session"
import { useTriagemOptional } from "@/components/triagem/triagem-provider"
import { isOpen as isOpenTriage } from "@/lib/triagem/model"
import { useOfficeData } from "@/lib/store/office-store"

/**
 * mode:
 *  - "expanded": sempre com rótulos (drawer mobile)
 *  - "auto": compacto entre 768–1023px e expandido a partir de 1024px
 *  - "collapsed": sempre compacto (usuário recolheu)
 */
export function SidebarNav({ mode, onNavigate, layoutId }: { mode: "expanded" | "auto" | "collapsed"; onNavigate?: () => void; layoutId: string }) {
  const pathname = usePathname()
  const data = useOfficeData()
  const triagem = useTriagemOptional()
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
    triagem: {
      count: (triagem?.items ?? []).filter((i) => isOpenTriage(i) && i.responsibleId === user.id).length,
      urgent: true,
      label: "eventos seus aguardando decisão na Triagem",
    },
    agenda: {
      count: data.appointments.filter((a) => isSameDay(parse(a.start), now) && parse(a.end) > now).length,
      urgent: false,
      label: "compromissos restantes hoje",
    },
  }

  const labelCls = mode === "expanded" ? "" : mode === "auto" ? "hidden lg:block" : "hidden"
  const compactCls = mode === "expanded" ? "" : mode === "auto" ? "max-lg:justify-center max-lg:px-0" : "justify-center px-0"
  const tooltipCls = mode === "expanded" ? "hidden" : mode === "auto" ? "lg:hidden" : ""
  // Recuo das telas internas só com rótulos (no modo compacto viram ícones como os outros).
  const childCls = mode === "expanded" ? "pl-8" : mode === "auto" ? "lg:pl-8" : ""
  // A setinha só existe com rótulos; fica dentro da linha, e o texto/badge abrem espaço para ela.
  const toggleCls = mode === "expanded" ? "flex" : mode === "auto" ? "hidden lg:flex" : "hidden"
  const toggleSpaceCls = mode === "expanded" ? "pr-7" : mode === "auto" ? "lg:pr-7" : ""

  const renderLink = (item: NavItem, active: boolean, child = false, withToggle = false) => {
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
                "group relative flex h-10 min-w-0 flex-1 items-center gap-3 rounded-control px-3 text-[13.5px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
                active ? "text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
                compactCls,
                child && cn("h-8 text-[13px]", childCls),
                withToggle && toggleSpaceCls,
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
            className={cn("relative size-[18px] shrink-0 transition-colors", active ? "text-sidebar-highlight" : "text-sidebar-muted group-hover:text-sidebar-foreground", child && "size-4")}
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
            <span aria-hidden className={cn("absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#ff8a80]", mode === "auto" && "lg:hidden")} />
          )}
          {active && <span aria-hidden className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-highlight" />}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className={tooltipCls}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      {visibleSections(can).map((section) => (
        <div key={section.label}>
          {/* Grupos sem título, como na identidade: só uma divisória antes de Configurações. */}
          <h2 className="sr-only">{section.label}</h2>
          {section.label === "Sistema" && <div aria-hidden className="mx-3 mb-4 h-px bg-sidebar-border" />}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const children = item.children ?? []
              const childActive = children.some((c) => isActive(pathname, c.href))
              const groupOpen = childActive || open.has(item.href)
              // Com rótulos, as telas internas aparecem pela setinha; só com ícones, ficam sempre à mostra.
              const childVisibility = mode === "collapsed" ? "" : groupOpen ? "" : mode === "auto" ? "lg:hidden" : "hidden"
              return (
                <li key={item.href}>
                  <div className="group/row relative flex items-center">
                    {renderLink(item, isActive(pathname, item.href) && !childActive, false, children.length > 0)}
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
                          "touch-target absolute top-1/2 right-2 size-5 -translate-y-1/2 items-center justify-center rounded-[6px] text-sidebar-muted/80 outline-none transition-[color,opacity] duration-150",
                          "hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/60 disabled:cursor-default",
                          "opacity-70 group-hover/row:opacity-100",
                          toggleCls,
                        )}
                      >
                        <ChevronDown
                          className={cn("size-3.5 transition-transform duration-200", !groupOpen && "-rotate-90")}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </button>
                    )}
                  </div>
                  {children.length > 0 && (
                    <ul
                      id={`nav-${item.href.slice(1)}`}
                      className={cn("mt-1 flex-col gap-1", childVisibility === "hidden" ? "hidden" : cn("flex", childVisibility))}
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
