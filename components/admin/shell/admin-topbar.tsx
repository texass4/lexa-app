"use client"

import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowLeftRight, Bell, BellOff, ChevronRight, LogOut, Menu, Moon, Search, ShieldCheck, Sun, X } from "lucide-react"
import { cn } from "cn"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/lib/theme"
import { useIsMac } from "@/lib/hooks"
import { fmtRelative } from "@/lib/dates"
import { signOutAndLeave } from "@/lib/auth/sign-out"
import { hardNavigate } from "@/lib/auth/navigate"
import type { Tone } from "@/lib/config"
import { adminRouteMeta } from "./nav"
import { useAdminShell } from "./admin-context"
import { AdminBrand, AdminNav, BackToCrm, MaintenanceNote } from "./admin-sidebar"

const DOT: Record<Tone, string> = {
  neutral: "bg-subtle",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  brand: "bg-brand",
  violet: "bg-violet",
}

function Breadcrumb() {
  const pathname = usePathname()
  const meta = adminRouteMeta(pathname)
  const deeper = pathname !== meta.href
  return (
    <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
      <span className="hidden shrink-0 items-center gap-1.5 text-subtle sm:flex">
        <ShieldCheck className="size-3.5 text-brand" /> Admin
        <ChevronRight className="size-3.5" />
      </span>
      {deeper ? (
        <>
          <Link href={meta.href} className="shrink-0 text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
            {meta.label}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-subtle" />
          <span className="truncate font-medium text-foreground">Detalhes</span>
        </>
      ) : (
        <span className="truncate font-medium text-foreground">{meta.label}</span>
      )}
    </nav>
  )
}

function NotificationsButton() {
  const { notifications, refresh } = useAdminShell()
  const router = useRouter()
  const count = notifications?.length ?? 0
  return (
    <Popover onOpenChange={(open) => open && refresh()}>
      <PopoverTrigger
        aria-label={count ? `Notificações — ${count} pendências` : "Notificações"}
        className="relative flex size-10 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/45 aria-expanded:bg-accent aria-expanded:text-foreground"
      >
        <Bell className="size-[18px]" strokeWidth={1.8} />
        {count > 0 && (
          <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9.5px] font-semibold text-brand-foreground ring-2 ring-background">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(400px,calc(100vw-24px))] gap-0 rounded-card p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13.5px] font-semibold">Pendências da plataforma</p>
          <p className="text-[12px] text-muted-foreground">{count ? `${count} ${count === 1 ? "item pede" : "itens pedem"} atenção` : "Tudo em ordem"}</p>
        </div>
        {notifications === null ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">Carregando…</p>
        ) : count === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <BellOff className="mb-2 size-5 text-subtle" />
            <p className="text-[13px] font-medium">Nenhuma pendência</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Aprovações, limites e eventos críticos aparecem aqui.</p>
          </div>
        ) : (
          <ul className="max-h-[440px] overflow-y-auto p-1.5 thin-scrollbar">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => router.push(n.href)}
                  className="flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[n.tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">{n.title}</span>
                    {n.detail && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{n.detail}</span>}
                    {n.at && <span className="mt-1 block text-[11px] text-subtle">{fmtRelative(n.at)}</span>}
                  </span>
                  <ChevronRight className="mt-1 size-3.5 shrink-0 text-subtle" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ProfileMenu() {
  const { admin } = useAdminShell()
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do administrador"
        className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:rounded-[10px] sm:py-1 sm:pr-2 sm:pl-1 sm:hover:bg-accent sm:aria-expanded:bg-accent"
      >
        <UserAvatar name={admin.name} size="md" tone="dark" />
        <span className="hidden min-w-0 text-left leading-tight xl:block">
          <span className="block max-w-[140px] truncate text-[12.5px] font-medium">{admin.name}</span>
          <span className="block text-[11px] text-brand-strong">Super Admin</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-[12px] p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block text-[13px] font-medium text-foreground">{admin.name}</span>
            <span className="block truncate text-[11.5px] font-normal text-muted-foreground">{admin.email}</span>
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-[5px] bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-medium text-brand-strong">
              <ShieldCheck className="size-3" /> Super Admin
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="h-8 px-2" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "dark" ? "Tema claro" : "Tema escuro"}
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => hardNavigate("/dashboard?de=admin")}>
            <ArrowLeftRight /> Voltar ao CRM
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-8 px-2" onClick={() => signOutAndLeave()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdminTopbar() {
  const { setSearchOpen, setDrawerOpen } = useAdminShell()
  const isMac = useIsMac()
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 md:h-[72px] lg:px-10">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          className="-ml-1.5 flex size-9 items-center justify-center rounded-control outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/45 md:hidden"
        >
          <Menu className="size-5" strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1">
          <Breadcrumb />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden h-9 w-[240px] items-center gap-2 rounded-control border border-border bg-surface px-3 text-[13px] text-subtle shadow-xs outline-none transition-colors hover:border-border-strong hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand/45 lg:flex xl:w-[300px]"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar escritórios, usuários…</span>
            <span className="flex items-center gap-0.5">
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar"
            className="flex size-9 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/45 lg:hidden"
          >
            <Search className="size-[18px]" strokeWidth={1.8} />
          </button>
          <NotificationsButton />
          <a
            href="/dashboard?de=admin"
            className="hidden h-9 items-center gap-2 rounded-control border border-border bg-surface px-3 text-[12.5px] font-medium text-foreground shadow-xs outline-none transition-colors hover:border-border-strong hover:bg-surface-muted/60 focus-visible:ring-2 focus-visible:ring-brand/45 sm:flex"
          >
            <ArrowLeftRight className="size-3.5" /> CRM
          </a>
          <div className="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <ProfileMenu />
        </div>
      </div>
    </header>
  )
}

export function AdminDrawer() {
  const { drawerOpen, setDrawerOpen } = useAdminShell()
  const close = () => setDrawerOpen(false)
  return (
    <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#0e1726]/35 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:hidden" />
        <DialogPrimitive.Popup className="sidebar-surface fixed inset-y-0 left-0 z-50 flex w-[min(296px,86vw)] flex-col text-admin-rail-foreground shadow-float outline-none transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full md:hidden">
          <DialogPrimitive.Title className="sr-only">Menu do Admin</DialogPrimitive.Title>
          <div className="flex h-[64px] items-center justify-between px-4">
            <AdminBrand />
            <DialogPrimitive.Close
              aria-label="Fechar menu"
              className="flex size-9 items-center justify-center rounded-control text-admin-rail-muted outline-none hover:bg-admin-rail-accent hover:text-admin-rail-foreground focus-visible:ring-2 focus-visible:ring-admin-rail-highlight/50"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
            <AdminNav variant="full" onNavigate={close} />
          </div>
          <div className="space-y-2 border-t border-admin-rail-border p-3 pb-[max(env(safe-area-inset-bottom),12px)]">
            <MaintenanceNote />
            <BackToCrm onNavigate={close} />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
