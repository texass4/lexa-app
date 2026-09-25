"use client"

import Link from "next/link"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "cn"
import { Logo } from "./logo"
import { SidebarNav } from "./sidebar-nav"
import { UserMenu } from "./user-menu"
import { useUI } from "@/lib/store/ui-store"

export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUI()
  const mode = collapsed ? "collapsed" : "auto"

  return (
    <aside
      aria-label="Barra lateral"
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex",
        collapsed ? "w-[72px]" : "w-[72px] lg:w-[240px]",
      )}
    >
      <div className={cn("flex h-[60px] shrink-0 items-center px-4", collapsed ? "justify-center px-0" : "max-lg:justify-center max-lg:px-0")}>
        <Link
          href="/dashboard"
          aria-label="LEXA — ir para o painel"
          className="rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          <Logo collapsed className={cn(!collapsed && "lg:hidden")} />
          {!collapsed && <Logo className="max-lg:hidden" />}
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pt-4 pb-3 no-scrollbar">
        <SidebarNav mode={mode} layoutId="sidebar-active" />
      </div>

      <div className="shrink-0 space-y-1 border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          title={collapsed ? "Expandir (Ctrl B)" : "Recolher (Ctrl B)"}
          className={cn(
            "hidden h-8 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 lg:flex",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && <span>Recolher menu</span>}
        </button>
        <div className={cn(collapsed ? "" : "lg:hidden")}>
          <UserMenu variant="sidebar" compact />
        </div>
        {!collapsed && (
          <div className="max-lg:hidden">
            <UserMenu variant="sidebar" />
          </div>
        )}
      </div>
    </aside>
  )
}
