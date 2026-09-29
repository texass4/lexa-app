import {
  CalendarDays,
  FolderOpen,
  Hourglass,
  LayoutGrid,
  ListChecks,
  MessagesSquare,
  Scale,
  Settings,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import type { Permission } from "@/lib/auth/permissions"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Contador que só aparece quando pede ação (ver `SidebarNav`). */
  badgeKey?: "tasks" | "processes" | "prazos"
  /** Sem ela, o item some do menu e a rota mostra "sem acesso". */
  permission?: Permission
  /** Telas dentro deste item (abrem pela setinha ao lado dele). */
  children?: NavItem[]
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [{ href: "/dashboard", label: "Painel", icon: LayoutGrid }],
  },
  {
    label: "Escritório",
    items: [
      { href: "/clientes", label: "Clientes", icon: UsersRound, permission: "clients.view" },
      { href: "/atendimento", label: "Atendimento", icon: MessagesSquare, permission: "whatsapp.view" },
      { href: "/processos", label: "Processos", icon: Scale, badgeKey: "processes", permission: "processes.view" },
      {
        href: "/tarefas",
        label: "Tarefas",
        icon: ListChecks,
        badgeKey: "tasks",
        permission: "tasks.view",
        children: [{ href: "/tarefas/prazos", label: "Prazos", icon: Hourglass, badgeKey: "prazos", permission: "processes.view" }],
      },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, permission: "agenda.view" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/documentos", label: "Documentos", icon: FolderOpen, permission: "documents.view" },
      { href: "/financeiro", label: "Financeiro", icon: Wallet, permission: "finance.view" },
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
  "/atendimento": { title: "Central de atendimento", section: "WhatsApp" },
  "/processos": { title: "Processos", section: "Escritório" },
  "/tarefas": { title: "Tarefas", section: "Escritório" },
  "/tarefas/prazos": { title: "Prazos", section: "Tarefas" },
  "/agenda": { title: "Agenda", section: "Escritório" },
  "/documentos": { title: "Documentos", section: "Gestão" },
  "/financeiro": { title: "Financeiro", section: "Gestão" },
  "/configuracoes": { title: "Configurações", section: "Sistema" },
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

const ALL_ITEMS = NAV_SECTIONS.flatMap((section) => section.items.flatMap((item) => [item, ...(item.children ?? [])]))

/** Permissão exigida pela rota (ou undefined se todos acessam). Vale a do item mais específico. */
export function routePermission(pathname: string) {
  return ALL_ITEMS.filter((item) => isActive(pathname, item.href)).sort((a, b) => b.href.length - a.href.length)[0]?.permission
}

/** Seções do menu só com o que a pessoa pode ver. */
export function visibleSections(can: (p: Permission) => boolean) {
  const allowed = (i: NavItem) => !i.permission || can(i.permission)
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(allowed).map((item) => (item.children ? { ...item, children: item.children.filter(allowed) } : item)),
  })).filter((section) => section.items.length > 0)
}
