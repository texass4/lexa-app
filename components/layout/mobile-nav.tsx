"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Building2, LayoutGrid, Menu, Scale, UsersRound, X } from "lucide-react"
import { cn } from "cn"
import { Logo } from "@/components/brand/logo"
import { SidebarNav, SidebarShortcuts } from "./sidebar-nav"
import { UserMenu } from "./user-menu"
import { isActive, routePermission } from "./nav-config"
import { useSession } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"
import { useMounted } from "@/lib/core/hooks"
import { getOrganization } from "@/lib/auth/account"

export function MobileDrawer() {
  const { mobileNavOpen, setMobileNavOpen } = useUI()
  return (
    <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#10263d]/35 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:hidden" />
        <DialogPrimitive.Popup className="sidebar-surface fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col text-sidebar-foreground shadow-float outline-none transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full md:hidden">
          <DialogPrimitive.Title className="sr-only">Menu de navegação</DialogPrimitive.Title>
          <div className="flex h-[72px] items-center justify-between px-4">
            <Logo />
            <DialogPrimitive.Close
              aria-label="Fechar menu"
              className="touch-target relative flex size-9 items-center justify-center rounded-control text-sidebar-muted outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pt-1 pb-4">
            <div className="flex items-center gap-2.5 rounded-control border border-sidebar-border bg-surface-muted/50 px-3 py-2">
              <Building2 className="size-4 shrink-0 text-sidebar-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[10.5px] font-semibold tracking-[0.08em] text-subtle uppercase">Escritório</span>
                <span className="block truncate text-[13px] font-medium text-sidebar-foreground">{getOrganization().name}</span>
              </span>
            </div>
            <SidebarNav mode="expanded" layoutId="drawer-active" onNavigate={() => setMobileNavOpen(false)} />
            <React.Suspense>
              <SidebarShortcuts mode="expanded" onNavigate={() => setMobileNavOpen(false)} />
            </React.Suspense>
          </div>
          <div className="px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
            <div className="border-t border-sidebar-border pt-2">
            <UserMenu variant="sidebar" />
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const TABS = [
  { href: "/dashboard", label: "Início", icon: LayoutGrid },
  { href: "/processos", label: "Processos", icon: Scale },
  { href: "/clientes", label: "Clientes", icon: UsersRound },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const { setMobileNavOpen, mobileNavOpen } = useUI()
  const mounted = useMounted()
  const { can } = useSession()
  const tabs = TABS.filter((tab) => {
    const permission = routePermission(tab.href)
    return !permission || can(permission)
  })
  return (
    <nav
      aria-label="Navegação rápida"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-surface/92 pb-safe shadow-[0_-8px_24px_-16px_rgb(16_24_40/0.18)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid h-[60px] max-w-md grid-flow-col auto-cols-fr">
        {tabs.map((tab) => {
          const active = mounted && isActive(pathname, tab.href)
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium outline-none transition-colors focus-visible:text-foreground",
                  active ? "text-primary" : "text-subtle",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-gold-soft text-gold-strong")}>
                  <tab.icon className="size-[18px]" strokeWidth={active ? 2 : 1.8} />
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-expanded={mobileNavOpen}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-subtle outline-none focus-visible:text-foreground"
          >
            <span className="flex h-7 w-11 items-center justify-center rounded-full">
              <Menu className="size-[18px]" strokeWidth={1.8} />
            </span>
            Menu
          </button>
        </li>
      </ul>
    </nav>
  )
}
