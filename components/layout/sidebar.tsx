"use client"

import * as React from "react"
import Link from "next/link"
import { Building2, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "cn"
import { Logo } from "@/components/brand/logo"
import { SidebarNav, SidebarShortcuts } from "./sidebar-nav"
import { useUI } from "@/lib/store/ui-store"
import { getOrganization } from "@/lib/auth/account"
import { BRAND } from "@/lib/core/brand"

/**
 * Barra lateral clara (desktop e tablet). Entre 768 e 1023 px fica compacta (só ícones);
 * a partir de 1024 px, expandida — a menos que a pessoa recolha (Ctrl B; a preferência fica
 * salva no navegador pelo `ui-store`). Módulos no topo, atalhos no meio, Configurações e a
 * assinatura da Digitaliza no rodapé. O menu da pessoa (perfil, tema, sair) fica na barra superior.
 */
export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUI()
  const mode = collapsed ? "collapsed" : "auto"
  const labels = collapsed ? "hidden" : "max-lg:hidden"

  return (
    <aside
      aria-label="Barra lateral"
      className={cn(
        "sidebar-surface fixed inset-y-0 left-0 z-30 hidden flex-col text-sidebar-foreground transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex",
        collapsed ? "w-[72px]" : "w-[72px] lg:w-[248px]",
      )}
    >
      <div className={cn("flex h-[72px] shrink-0 items-center px-5", collapsed ? "justify-center px-0" : "max-lg:justify-center max-lg:px-0")}>
        <Link
          href="/dashboard"
          aria-label={`${BRAND.name} — ir para o início`}
          className="touch-target relative rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"
        >
          <Logo collapsed className={cn(!collapsed && "lg:hidden")} />
          {!collapsed && <Logo size="lg" className="max-lg:hidden" />}
        </Link>
      </div>

      {/* O escritório em uso, separado da marca (antes aparecia como subtítulo do logo). */}
      <div className={cn("shrink-0 px-3 pb-2", labels)}>
        <div className="flex items-center gap-2.5 rounded-control border border-sidebar-border bg-surface-muted/50 px-3 py-2" title={getOrganization().name}>
          <Building2 className="size-4 shrink-0 text-sidebar-muted" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[10.5px] font-semibold tracking-[0.08em] text-subtle uppercase">Escritório</span>
            <span className="block truncate text-[13px] font-medium text-sidebar-foreground">{getOrganization().name}</span>
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto px-3 pt-2 pb-4 no-scrollbar">
        <SidebarNav mode={mode} layoutId="sidebar-active" section="main" />
        {/* Os atalhos leem os filtros da URL: precisam de Suspense na renderização estática. */}
        <React.Suspense>
          <SidebarShortcuts mode={mode} />
        </React.Suspense>
      </div>

      <div className="shrink-0 border-t border-sidebar-border px-3 pt-3 pb-4">
        <SidebarNav mode={mode} layoutId="sidebar-active" section="system" />
        <div className={cn("mt-3 flex items-center gap-2", collapsed ? "justify-center" : "max-lg:justify-center lg:justify-between lg:pl-3")}>
          <p className={cn("text-[11.5px] leading-snug text-subtle", labels)}>
            <span className="font-semibold text-muted-foreground">Digitaliza</span>
            <br />
            Tecnologia que impulsiona a advocacia
          </p>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            title={collapsed ? "Expandir (Ctrl B)" : "Recolher (Ctrl B)"}
            className="hidden size-9 shrink-0 items-center justify-center rounded-control text-sidebar-muted outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 lg:flex"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}
