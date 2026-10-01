"use client"

import Link from "next/link"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "cn"
import { Logo } from "@/components/brand/logo"
import { SidebarNav } from "./sidebar-nav"
import { SidebarAICard } from "./sidebar-ai-card"
import { useUI } from "@/lib/store/ui-store"
import { getOrganization } from "@/lib/account"
import { BRAND } from "@/lib/brand"

/**
 * Barra lateral marinho (desktop e tablet). Entre 768 e 1023 px fica compacta (só
 * ícones); a partir de 1024 px, expandida — a menos que a pessoa recolha (Ctrl B).
 * O menu da pessoa (perfil, tema, sair) fica no topo (`topbar.tsx`); no mobile, no drawer.
 */
export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUI()
  const mode = collapsed ? "collapsed" : "auto"

  return (
    <aside
      aria-label="Barra lateral"
      className={cn(
        "sidebar-surface sidebar-columns fixed inset-y-0 left-0 z-30 hidden flex-col text-sidebar-foreground transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex",
        collapsed ? "w-[76px]" : "w-[76px] lg:w-[256px]",
      )}
    >
      <div className={cn("flex h-[76px] shrink-0 items-center px-5", collapsed ? "justify-center px-0" : "max-lg:justify-center max-lg:px-0")}>
        <Link
          href="/dashboard"
          aria-label={`${BRAND.name} — ir para o painel`}
          className="rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
        >
          <Logo collapsed tone="inverse" className={cn(!collapsed && "lg:hidden")} />
          {!collapsed && <Logo tone="inverse" size="lg" subtitle={getOrganization().name} className="max-lg:hidden" />}
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-4 no-scrollbar">
        <SidebarNav mode={mode} layoutId="sidebar-active" />
      </div>

      <div className="relative shrink-0 px-3 pb-4 lg:pb-9">
        {!collapsed && (
          <div className="max-lg:hidden [@media(max-height:939px)]:hidden">
            <SidebarAICard />
          </div>
        )}
        <div className={cn("flex items-end gap-2 pt-5", collapsed ? "justify-center" : "max-lg:justify-center lg:justify-between lg:pt-28 lg:pl-3 lg:[@media(min-height:940px)]:pt-[200px]")}>
          {!collapsed && (
            <p className="text-[13.5px] leading-relaxed text-white/90 max-lg:hidden">
              Mais organização.
              <br />
              Mais resultados.
            </p>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            title={collapsed ? "Expandir (Ctrl B)" : "Recolher (Ctrl B)"}
            className="hidden size-9 shrink-0 items-center justify-center rounded-control text-sidebar-muted outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/60 lg:flex"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}
