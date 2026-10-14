"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import * as React from "react"
import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SHORTCUTS, isActive, visibleSections, type NavItem, type Shortcut } from "./nav-config"
import { diffInDays, getNow, isSameDay, parse } from "@/lib/core/dates"
import { isOverdue, taskBucket } from "@/lib/store/selectors"
import { PRAZO_ALERT_DAYS, RECENT_DAYS, isActiveProcess } from "@/lib/dashboard/attention"
import { daysToPrazo, isOpenPrazo, nextPrazo, prazoPeriod } from "@/lib/prazos/prazos"
import { useSession } from "@/lib/auth/session"
import { useOfficeData } from "@/lib/store/office-store"

/**
 * mode:
 *  - "expanded": sempre com rótulos (drawer mobile)
 *  - "auto": compacto entre 768–1023px e expandido a partir de 1024px
 *  - "collapsed": sempre compacto (usuário recolheu)
 */
type Mode = "expanded" | "auto" | "collapsed"

function modeClasses(mode: Mode) {
  return {
    label: mode === "expanded" ? "" : mode === "auto" ? "hidden lg:block" : "hidden",
    compact: mode === "expanded" ? "" : mode === "auto" ? "max-lg:justify-center max-lg:px-0" : "justify-center px-0",
    tooltip: mode === "expanded" ? "hidden" : mode === "auto" ? "lg:hidden" : "",
    // Recuo das telas internas só com rótulos (no modo compacto viram ícones como os outros).
    child: mode === "expanded" ? "pl-9" : mode === "auto" ? "lg:pl-9" : "",
    // A setinha só existe com rótulos; fica dentro da linha, e o texto/badge abrem espaço para ela.
    toggle: mode === "expanded" ? "flex" : mode === "auto" ? "hidden lg:flex" : "hidden",
    toggleSpace: mode === "expanded" ? "pr-8" : mode === "auto" ? "lg:pr-8" : "",
  }
}

const linkBase =
  "group relative flex h-10 min-w-0 flex-1 items-center gap-3 rounded-control px-3 text-[14px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"

/** Contadores que pedem ação (menu) e números dos atalhos — sempre calculados dos dados do escritório. */
function useCounts() {
  const data = useOfficeData()
  const { user } = useSession()
  const now = getNow()
  return React.useMemo(() => {
    const myDue = data.tasks.filter((t) => t.assigneeId === user.id && t.status === "pendente" && diffInDays(parse(t.dueAt), now) <= 0)
    const processesWithPrazo = data.processes.filter((p) => {
      const next = isActiveProcess(p) ? nextPrazo(data.deadlines, p.id) : undefined
      return next !== undefined && daysToPrazo(next, now) <= PRAZO_ALERT_DAYS.soon
    }).length
    const badges: Record<NonNullable<NavItem["badgeKey"]>, { count: number; urgent: boolean; label: string }> = {
      tasks: { count: myDue.length, urgent: myDue.some((t) => isOverdue(t, now)), label: "suas tarefas atrasadas ou para hoje" },
      processes: { count: processesWithPrazo, urgent: true, label: `processos com prazo em até ${PRAZO_ALERT_DAYS.soon} dias` },
      prazos: {
        count: data.deadlines.filter((p) => isOpenPrazo(p) && daysToPrazo(p, now) <= PRAZO_ALERT_DAYS.soon).length,
        urgent: true,
        label: `prazos abertos vencidos ou em até ${PRAZO_ALERT_DAYS.soon} dias`,
      },
      agenda: {
        count: data.appointments.filter((a) => isSameDay(parse(a.start), now) && parse(a.end) > now).length,
        urgent: false,
        label: "compromissos restantes hoje",
      },
    }
    // Mesmos critérios dos filtros das telas (`?filtro=hoje`, `?filtro=semana`, `?filtro=prazos`).
    const shortcuts: Record<Shortcut["countKey"], number | undefined> = {
      tarefasHoje: data.tasks.filter((t) => t.assigneeId === user.id && t.status === "pendente" && taskBucket(t, now) === "hoje").length,
      prazosSemana: data.deadlines.filter((p) => isOpenPrazo(p) && ["hoje", "semana"].includes(prazoPeriod(p, now))).length,
      processosPrazo: processesWithPrazo,
      // Mesma regra da pasta "Recentes" de Documentos (enviados nos últimos dias).
      documentos: data.documents.filter((d) => diffInDays(now, parse(d.uploadedAt)) <= RECENT_DAYS).length,
    }
    return { badges, shortcuts }
    // `now` muda a cada render; os dados é que importam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.tasks, data.processes, data.deadlines, data.appointments, data.documents, user.id])
}

function NavLink({
  item,
  active,
  mode,
  child = false,
  withToggle = false,
  badge,
  onNavigate,
  layoutId,
}: {
  item: { href: string; label: string; icon: NavItem["icon"] }
  active: boolean
  mode: Mode
  child?: boolean
  withToggle?: boolean
  badge?: { count: number; urgent: boolean; label: string }
  onNavigate?: () => void
  layoutId: string
}) {
  const c = modeClasses(mode)
  const Icon = item.icon
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
              linkBase,
              active ? "text-brand-strong dark:text-sidebar-highlight" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
              c.compact,
              child && cn("h-9 text-[13.5px] pointer-coarse:h-10", c.child),
              withToggle && c.toggleSpace,
            )}
          />
        }
      >
        {active && (
          <motion.span layoutId={layoutId} transition={{ type: "spring", stiffness: 520, damping: 42 }} className="absolute inset-0 rounded-control bg-sidebar-active" />
        )}
        <Icon
          className={cn(
            "relative size-[18px] shrink-0 transition-colors",
            active ? "text-brand dark:text-sidebar-highlight" : "text-sidebar-muted group-hover:text-sidebar-foreground",
            child && "size-4",
          )}
          strokeWidth={1.8}
        />
        <span className={cn("relative flex-1 truncate", c.label)}>{item.label}</span>
        {badge && (
          <span
            className={cn(
              "relative tabular flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
              badge.urgent ? "bg-danger-soft text-danger" : "bg-surface-muted text-muted-foreground",
              c.label,
            )}
          >
            {badge.count}
          </span>
        )}
        {badge?.urgent && mode !== "expanded" && (
          <span aria-hidden className={cn("absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger", mode === "auto" && "lg:hidden")} />
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className={c.tooltip}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Menu principal. `section="main"`: módulos de trabalho; `section="system"`: Configurações
 * (no rodapé da barra). Itens sem permissão nem aparecem — a rota também bloqueia.
 */
export function SidebarNav({
  mode,
  onNavigate,
  layoutId,
  section = "all",
}: {
  mode: Mode
  onNavigate?: () => void
  layoutId: string
  section?: "all" | "main" | "system"
}) {
  const pathname = usePathname()
  const data = useOfficeData()
  const { can } = useSession()
  const { badges } = useCounts()
  const c = modeClasses(mode)
  // Itens com telas internas abertos pela setinha (ex.: Tarefas › Prazos).
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set())
  const sections = visibleSections(can).filter((s) => section === "all" || (section === "system") === (s.label === "Sistema"))

  return (
    <nav aria-label={section === "system" ? "Sistema" : "Navegação principal"} className="flex flex-col gap-1">
      {sections.map((s) => (
        <div key={s.label}>
          <h2 className="sr-only">{s.label}</h2>
          <ul className="flex flex-col gap-0.5">
            {s.items.map((item) => {
              const children = item.children ?? []
              const childActive = children.some((ch) => isActive(pathname, ch.href))
              const groupOpen = childActive || open.has(item.href)
              // Com rótulos, as telas internas aparecem pela setinha; só com ícones, ficam sempre à mostra.
              const childVisibility = mode === "collapsed" ? "" : groupOpen ? "" : mode === "auto" ? "lg:hidden" : "hidden"
              const badgeOf = (i: NavItem) => (i.badgeKey && data.hydrated && badges[i.badgeKey].count > 0 ? badges[i.badgeKey] : undefined)
              return (
                <li key={item.href}>
                  <div className="group/row relative flex items-center">
                    <NavLink
                      item={item}
                      active={isActive(pathname, item.href) && !childActive}
                      mode={mode}
                      withToggle={children.length > 0}
                      badge={badgeOf(item)}
                      onNavigate={onNavigate}
                      layoutId={layoutId}
                    />
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
                          "touch-target absolute top-1/2 right-2 size-6 -translate-y-1/2 items-center justify-center rounded-[6px] text-sidebar-muted outline-none transition-colors duration-150",
                          "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 disabled:cursor-default disabled:hover:bg-transparent",
                          c.toggle,
                        )}
                      >
                        <ChevronDown className={cn("size-3.5 transition-transform duration-200", !groupOpen && "-rotate-90")} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                  </div>
                  {children.length > 0 && (
                    <ul id={`nav-${item.href.slice(1)}`} className={cn("mt-0.5 flex-col gap-0.5", childVisibility === "hidden" ? "hidden" : cn("flex", childVisibility))}>
                      {children.map((ch) => (
                        <li key={ch.href} className="flex">
                          <NavLink item={ch} active={isActive(pathname, ch.href)} mode={mode} child badge={badgeOf(ch)} onNavigate={onNavigate} layoutId={layoutId} />
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

/** Atalhos: listas reais já filtradas, com o número calculado dos dados (sem número = sem contagem útil). */
export function SidebarShortcuts({ mode, onNavigate }: { mode: Mode; onNavigate?: () => void }) {
  const { can } = useSession()
  const data = useOfficeData()
  const pathname = usePathname()
  const query = useSearchParams().toString()
  const { shortcuts } = useCounts()
  const c = modeClasses(mode)
  const items = SHORTCUTS.filter((s) => can(s.permission))
  if (!items.length) return null
  return (
    <nav aria-labelledby="sidebar-shortcuts" className="flex flex-col gap-1">
      <h2 id="sidebar-shortcuts" className={cn("px-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase", c.label)}>
        Atalhos
      </h2>
      <div aria-hidden className={cn("mx-3 mb-1 h-px bg-sidebar-border", mode === "expanded" ? "hidden" : mode === "auto" ? "lg:hidden" : "")} />
      <ul className="flex flex-col gap-0.5">
        {items.map((s) => {
          const count = data.hydrated ? shortcuts[s.countKey] : undefined
          const active = `${pathname}${query ? `?${query}` : ""}` === s.href
          const Icon = s.icon
          return (
            <li key={s.href}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href={s.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      aria-label={count !== undefined ? `${s.label}: ${count}` : s.label}
                      className={cn(
                        linkBase,
                        "h-9 text-[13.5px] font-normal",
                        active ? "bg-sidebar-active text-brand-strong" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        c.compact,
                      )}
                    />
                  }
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                  <span className={cn("flex-1 truncate", c.label)}>{s.label}</span>
                  {count !== undefined && count > 0 && <span className={cn("tabular text-[12px] text-subtle", c.label)}>{count}</span>}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className={c.tooltip}>
                  {count !== undefined ? `${s.label} (${count})` : s.label}
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
