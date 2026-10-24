"use client"

import { FileText, FolderKanban, Inbox, ListChecks, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Search, Waypoints } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { logoutAction } from "@/app/actions/auth"
import { createBoardAction } from "@/app/actions/boards"
import { createPageAction } from "@/app/actions/pages"
import { DropdownMenu } from "@/components/ui/menu"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/cn"
import { toast } from "sonner"
import { isActive, NAV, SETTINGS_ITEM, type NavItem } from "./nav-items"
import { useShell } from "./shell-context"

export function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="group flex items-baseline gap-1.5 rounded-sm px-1 text-paper" aria-label="Mesa — início">
      <span className={cn("font-serif leading-none tracking-tight", collapsed ? "text-xl" : "text-[1.4rem]")}>{collapsed ? "M" : "Mesa"}</span>
      <span className="size-1.5 rounded-full bg-cobalt transition-transform group-hover:scale-125" aria-hidden />
    </Link>
  )
}

/** Menu "Novo": a mesma criação rápida em toda a aplicação. */
export function useCreateMenu() {
  const shell = useShell()
  const router = useRouter()
  const create = async (fn: () => Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }>, path: string) => {
    const result = await fn()
    if (!result.ok) return toast.error(result.error)
    router.push(`${path}/${result.data.id}`)
  }
  return [
    { label: "Tarefa", icon: <ListChecks />, hint: "N", onSelect: () => shell.openQuickTask() },
    { label: "Captura rápida", icon: <Inbox />, hint: "C", onSelect: () => shell.openCapture() },
    { type: "separator" as const },
    { label: "Página", icon: <FileText />, onSelect: () => void create(() => createPageAction({}), "/pages") },
    { label: "Quadro visual", icon: <Waypoints />, onSelect: () => void create(() => createBoardAction({}), "/canvas") },
    { label: "Projeto", icon: <FolderKanban />, onSelect: () => router.push("/projects?new=1") },
  ]
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const { counts } = useShell()
  const active = isActive(pathname, item.href)
  const count = item.count === "inbox" ? counts.inbox : item.count === "overdue" ? counts.overdue : 0
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-sm text-[0.8125rem] transition-colors",
        collapsed ? "justify-center px-0" : "px-2.5",
        active ? "bg-nav-3 text-paper" : "text-nav-text hover:bg-nav-2 hover:text-paper",
      )}
    >
      {active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-cobalt" aria-hidden /> : null}
      <Icon className={cn("size-4 shrink-0", active ? "text-paper" : "text-nav-muted")} strokeWidth={1.75} />
      {collapsed ? null : <span className="flex-1 truncate">{item.label}</span>}
      {count > 0 ? (
        <span
          className={cn(
            "font-mono text-[10px] leading-none tabular-nums",
            collapsed ? "absolute top-1 right-1 rounded-full bg-cobalt px-1 py-0.5 text-white" : item.count === "overdue" ? "text-[#f0a58f]" : "text-nav-muted",
          )}
          aria-label={item.count === "overdue" ? `${count} atrasadas` : `${count} itens`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  )
}

export function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      {NAV.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {collapsed ? <div className="mx-auto mb-1 h-px w-5 bg-nav-3" aria-hidden /> : <div className="mb-1 px-2.5 font-mono text-[10px] tracking-[0.12em] text-nav-muted uppercase">{group.label}</div>}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const shell = useShell()
  const createItems = useCreateMenu()
  return (
    <aside
      className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-black/20 bg-nav text-nav-text transition-[width] duration-150 md:flex", collapsed ? "w-14" : "w-58")}
      aria-label="Barra lateral"
    >
      <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "justify-between pr-2 pl-4")}>
        {collapsed ? null : <Brand />}
        <button
          onClick={onToggle}
          className="rounded-sm p-1.5 text-nav-muted hover:bg-nav-2 hover:text-paper"
          aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <div className={cn("flex gap-1.5 pb-4", collapsed ? "flex-col items-center px-2" : "px-3")}>
        <button
          onClick={shell.openPalette}
          className={cn(
            "flex h-8 items-center gap-2 rounded-sm border border-nav-3 text-nav-muted transition-colors hover:border-nav-muted/60 hover:text-paper",
            collapsed ? "w-8 justify-center" : "flex-1 px-2.5 text-[0.8125rem]",
          )}
          aria-label="Buscar e comandos"
          title="Buscar (Ctrl K)"
        >
          <Search className="size-3.5" />
          {collapsed ? null : (
            <>
              <span className="flex-1 text-left">Buscar</span>
              <Kbd className="border-nav-muted/40">⌘K</Kbd>
            </>
          )}
        </button>
        <DropdownMenu
          align="start"
          items={createItems}
          trigger={
            <button className="flex h-8 w-8 items-center justify-center rounded-sm bg-cobalt text-white transition-colors hover:bg-cobalt-ink" aria-label="Criar novo" title="Criar">
              <Plus className="size-4" />
            </button>
          }
        />
      </div>

      <div className={cn("flex-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-2")}>
        <NavList collapsed={collapsed} />
      </div>

      <div className={cn("flex border-t border-nav-2 py-2", collapsed ? "flex-col items-center gap-1 px-2" : "items-center gap-1 px-2")}>
        <div className="flex-1">
          <NavLink item={SETTINGS_ITEM} collapsed={collapsed} />
        </div>
        <form action={logoutAction}>
          <button className="flex h-8 w-8 items-center justify-center rounded-sm text-nav-muted hover:bg-nav-2 hover:text-paper" aria-label="Sair" title="Sair">
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </aside>
  )
}
