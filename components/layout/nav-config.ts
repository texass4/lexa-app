import { CalendarDays, FolderOpen, LayoutGrid, ListChecks, Scale, Settings, UsersRound, Wallet, type LucideIcon } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  badgeKey?: "tasks"
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [{ href: "/dashboard", label: "Painel", icon: LayoutGrid }],
  },
  {
    label: "Escritório",
    items: [
      { href: "/clientes", label: "Clientes", icon: UsersRound },
      { href: "/processos", label: "Processos", icon: Scale },
      { href: "/tarefas", label: "Tarefas", icon: ListChecks, badgeKey: "tasks" },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/documentos", label: "Documentos", icon: FolderOpen },
      { href: "/financeiro", label: "Financeiro", icon: Wallet },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/configuracoes", label: "Configurações", icon: Settings }],
  },
]

export const ROUTE_META: Record<string, { title: string; section: string }> = {
  "/dashboard": { title: "Visão geral", section: "Painel" },
  "/clientes": { title: "Clientes", section: "Escritório" },
  "/processos": { title: "Processos", section: "Escritório" },
  "/tarefas": { title: "Tarefas", section: "Escritório" },
  "/agenda": { title: "Agenda", section: "Escritório" },
  "/documentos": { title: "Documentos", section: "Gestão" },
  "/financeiro": { title: "Financeiro", section: "Gestão" },
  "/configuracoes": { title: "Configurações", section: "Sistema" },
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}
