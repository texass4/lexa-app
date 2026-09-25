"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Menu, Search } from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { LogoMark } from "./logo"
import { NewMenu } from "./new-menu"
import { NotificationsMenu } from "./notifications-menu"
import { UserMenu } from "./user-menu"
import { ROUTE_META } from "./nav-config"
import { useUI } from "@/lib/store/ui-store"
import { useDemoData } from "@/lib/store/demo-store"
import { getNow, fmtFullDate } from "@/lib/dates"
import { useIsMac } from "@/lib/hooks"

function useHeaderContext() {
  const pathname = usePathname()
  const data = useDemoData()
  const [, root, id] = pathname.split("/")
  const meta = ROUTE_META[`/${root}`] ?? { title: "LEXA", section: "" }

  if (id && root === "clientes") {
    const c = data.clients.find((x) => x.id === id)
    return { title: c?.name ?? "Cliente", parent: { label: "Clientes", href: "/clientes" } }
  }
  if (id && root === "processos") {
    const p = data.processes.find((x) => x.id === id)
    return { title: p ? `Processo ${p.code}` : "Processo", parent: { label: "Processos", href: "/processos" } }
  }
  // A data depende do relógio do navegador: só aparece depois da hidratação,
  // para o HTML do servidor e o do navegador serem iguais.
  if (root === "dashboard") return { title: meta.title, subtitle: data.hydrated ? fmtFullDate(getNow()) : "" }
  return { title: meta.title, subtitle: meta.section }
}

export function Topbar() {
  const { setCommandOpen, setMobileNavOpen } = useUI()
  const ctx = useHeaderContext()
  const isMac = useIsMac()

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-[60px] w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Mobile: menu + logo */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Abrir menu"
          className="-ml-1.5 flex size-9 items-center justify-center rounded-[9px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-gold/45 md:hidden"
        >
          <Menu className="size-5" strokeWidth={1.8} />
        </button>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-gold/45 md:hidden"
          aria-label="LEXA — painel"
        >
          <LogoMark className="size-7" />
          <span className="text-[13px] font-semibold tracking-[0.22em]">LEXA</span>
        </Link>

        {/* Desktop: título contextual */}
        <div className="hidden min-w-0 flex-1 md:block">
          {"parent" in ctx && ctx.parent ? (
            <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1.5 text-[14px]">
              <Link href={ctx.parent.href} className="shrink-0 text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
                {ctx.parent.label}
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-subtle" />
              <span className="truncate font-medium text-foreground">{ctx.title}</span>
            </nav>
          ) : (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">{ctx.title}</span>
              {"subtitle" in ctx && ctx.subtitle && <span className="truncate text-[12px] text-muted-foreground">{ctx.subtitle}</span>}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="group hidden h-9 w-[260px] items-center gap-2 rounded-[9px] border border-border bg-surface px-3 text-[13px] text-subtle shadow-xs outline-none transition-colors hover:border-border-strong hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-gold/45 lg:flex xl:w-[300px]"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar clientes, processos…</span>
            <span className="flex items-center gap-0.5">
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            aria-label="Buscar"
            className="flex size-9 items-center justify-center rounded-[9px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/45 lg:hidden"
          >
            <Search className="size-[18px]" strokeWidth={1.8} />
          </button>
          <NotificationsMenu />
          <div className="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden />
          <div className="hidden md:block">
            <UserMenu variant="header" />
          </div>
          <div className="hidden sm:block">
            <NewMenu />
          </div>
          <div className="sm:hidden">
            <NewMenu compact />
          </div>
        </div>
      </div>
    </header>
  )
}
