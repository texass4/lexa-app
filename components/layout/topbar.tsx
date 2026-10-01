"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Menu, Search } from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { Logo } from "@/components/brand/logo"
import { NewMenu } from "./new-menu"
import { NotificationsMenu } from "./notifications-menu"
import { LexaTrigger } from "@/components/ai/lexa-trigger"
import { UserMenu } from "./user-menu"
import { ROUTE_META } from "./nav-config"
import { useUI } from "@/lib/store/ui-store"
import { useOfficeData } from "@/lib/store/office-store"
import { useIsMac } from "@/lib/core/hooks"
import { BRAND } from "@/lib/core/brand"

/** Trilha das telas de detalhe (cliente, processo). As demais têm o título na própria página. */
function useBreadcrumb() {
  const pathname = usePathname()
  const data = useOfficeData()
  const [, root, id] = pathname.split("/")
  if (id && root === "clientes") {
    const c = data.clients.find((x) => x.id === id)
    return { title: c?.name ?? "Cliente", parent: { label: ROUTE_META["/clientes"].title, href: "/clientes" } }
  }
  if (id === "prazos" && root === "tarefas") return { title: "Prazos", parent: { label: "Tarefas", href: "/tarefas" } }
  if (id && root === "processos") {
    const p = data.processes.find((x) => x.id === id)
    return { title: p ? `Processo ${p.code}` : "Processo", parent: { label: ROUTE_META["/processos"].title, href: "/processos" } }
  }
  return undefined
}

export function Topbar() {
  const { setCommandOpen, setMobileNavOpen } = useUI()
  const crumb = useBreadcrumb()
  // O Painel tem o próprio botão "Novo" no cabeçalho da página.
  const onDashboard = usePathname() === "/dashboard"
  const isMac = useIsMac()

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6 md:h-[72px] lg:gap-5 lg:px-8 xl:px-10">
        {/* Mobile: menu + logo */}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Abrir menu"
          className="-ml-1.5 flex size-10 items-center justify-center rounded-control text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/45 md:hidden"
        >
          <Menu className="size-5" strokeWidth={1.8} />
        </button>
        <Link
          href="/dashboard"
          className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/45 md:hidden"
          aria-label={`${BRAND.name} — painel`}
        >
          <Logo size="sm" />
        </Link>

        {/* Desktop: trilha (telas de detalhe) e busca global */}
        <div className="hidden min-w-0 flex-1 items-center gap-5 md:flex">
          {crumb && (
            <nav aria-label="Trilha" className="flex min-w-0 max-w-[45%] shrink-0 items-center gap-1.5 text-[13.5px]">
              <Link href={crumb.parent.href} className="shrink-0 text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
                {crumb.parent.label}
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-subtle" />
              <span className="min-w-0 truncate font-medium text-foreground">{crumb.title}</span>
            </nav>
          )}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="group hidden h-11 min-w-[200px] max-w-[560px] flex-1 items-center gap-2.5 rounded-[12px] border border-border/90 bg-surface px-4 text-[13.5px] text-subtle shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand/45 lg:flex"
          >
            <Search className="size-[17px] text-muted-foreground" strokeWidth={1.8} />
            <span className="flex-1 truncate text-left">Buscar cliente, processo, documento…</span>
            <span className="flex items-center gap-0.5">
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            aria-label="Buscar"
            className="flex size-10 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/45 lg:hidden"
          >
            <Search className="size-[18px]" strokeWidth={1.8} />
          </button>
          <LexaTrigger />
          <NotificationsMenu />
          <div className="mx-1.5 hidden h-7 w-px bg-border md:block" aria-hidden />
          <div className="hidden md:block">
            <UserMenu variant="header" />
          </div>
          {!onDashboard && (
            <>
              <div className="hidden sm:block">
                <NewMenu />
              </div>
              <div className="sm:hidden">
                <NewMenu compact />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
