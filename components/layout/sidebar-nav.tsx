"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isActive, visibleSections } from "./nav-config"
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
  const { can } = useSession()
  const badges = {
    tasks: data.tasks.filter((t) => t.status === "pendente").length,
  }

  const labelCls = mode === "expanded" ? "" : mode === "auto" ? "hidden lg:block" : "hidden"
  const compactCls = mode === "expanded" ? "" : mode === "auto" ? "max-lg:justify-center max-lg:px-0" : "justify-center px-0"
  const tooltipCls = mode === "expanded" ? "hidden" : mode === "auto" ? "lg:hidden" : ""

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      {visibleSections(can).map((section) => (
        <div key={section.label}>
          <p className={cn("mb-1.5 px-2.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-subtle", labelCls)}>{section.label}</p>
          {mode !== "expanded" && <div className={cn("mx-auto mb-2 h-px w-6 bg-border", mode === "auto" ? "lg:hidden" : "")} aria-hidden />}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              const badge = item.badgeKey ? badges[item.badgeKey] : undefined
              return (
                <li key={item.href}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          aria-label={item.label}
                          className={cn(
                            "group relative flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
                            active ? "text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                            compactCls,
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
                        className={cn("relative size-[17px] shrink-0", active ? "text-foreground" : "text-subtle group-hover:text-foreground")}
                        strokeWidth={1.8}
                      />
                      <span className={cn("relative flex-1 truncate", labelCls)}>{item.label}</span>
                      {badge !== undefined && <span className={cn("relative tabular text-[11px] font-medium text-subtle", labelCls)}>{badge}</span>}
                      {active && (
                        <span aria-hidden className="absolute top-1/2 -left-3 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-gold max-md:hidden" />
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
