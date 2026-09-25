"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { LayoutGrid, Menu, Scale, UsersRound, X } from "lucide-react"
import { cn } from "cn"
import { Logo } from "./logo"
import { SidebarNav } from "./sidebar-nav"
import { UserMenu } from "./user-menu"
import { isActive, routePermission } from "./nav-config"
import { useSession } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"
import { useMounted } from "@/lib/hooks"
import { getOrganization } from "@/lib/account"

export function MobileDrawer() {
  const { mobileNavOpen, setMobileNavOpen } = useUI()
  return (
    <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#171717]/25 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:hidden" />
        <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col border-r border-border bg-sidebar shadow-float outline-none transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full md:hidden">
          <DialogPrimitive.Title className="sr-only">Menu de navegação</DialogPrimitive.Title>
          <div className="flex h-[60px] items-center justify-between px-4">
            <Logo subtitle={getOrganization().name} />
            <DialogPrimitive.Close
              aria-label="Fechar menu"
              className="flex size-9 items-center justify-center rounded-[9px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/45"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-4">
            <SidebarNav mode="expanded" layoutId="drawer-active" onNavigate={() => setMobileNavOpen(false)} />
          </div>
          <div className="border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),12px)]">
            <UserMenu variant="sidebar" />
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-safe backdrop-blur-md md:hidden"
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
                  active ? "text-foreground" : "text-subtle",
                )}
              >
                <span className={cn("flex h-7 w-11 items-center justify-center rounded-full transition-colors", active && "bg-surface-muted")}>
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
