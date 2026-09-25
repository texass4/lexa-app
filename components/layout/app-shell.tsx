"use client"

import { cn } from "cn"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { MobileBottomNav, MobileDrawer } from "./mobile-nav"
import { CommandMenu } from "./command-menu"
import { GlobalDialogs } from "./global-dialogs"
import { useUI } from "@/lib/store/ui-store"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUI()
  return (
    <div className="min-h-dvh">
      <a
        href="#conteudo"
        className="fixed top-2 left-2 z-[60] -translate-y-16 rounded-md bg-primary px-3 py-2 text-[13px] text-primary-foreground transition-transform focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div
        className={cn(
          "flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:pl-[72px]",
          !sidebarCollapsed && "lg:pl-[240px]",
        )}
      >
        <Topbar />
        <main id="conteudo" className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-14 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
      <MobileBottomNav />
      <MobileDrawer />
      <CommandMenu />
      <GlobalDialogs />
    </div>
  )
}
