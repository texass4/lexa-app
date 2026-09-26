import { CalendarDays, FolderOpen, LayoutGrid, ListChecks, MessagesSquare, Scale, Settings, UsersRound, Wallet, type LucideIcon } from "lucide-react"
import type { Permission } from "@/lib/auth/permissions"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  badgeKey?: "tasks"
  /** Sem ela, o item some do menu e a rota mostra "sem acesso". */
  permission?: Permission
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
      { href: "/processos", label: "Processos", icon: Scale, permission: "processes.view" },
      { href: "/tarefas", label: "Tarefas", icon: ListChecks, badgeKey: "tasks", permission: "tasks.view" },
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
  "/agenda": { title: "Agenda", section: "Escritório" },
  "/documentos": { title: "Documentos", section: "Gestão" },
  "/financeiro": { title: "Financeiro", section: "Gestão" },
  "/configuracoes": { title: "Configurações", section: "Sistema" },
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

const ALL_ITEMS = NAV_SECTIONS.flatMap((section) => section.items)

/** Permissão exigida pela rota (ou undefined se todos acessam). */
export function routePermission(pathname: string) {
  return ALL_ITEMS.find((item) => isActive(pathname, item.href))?.permission
}

/** Seções do menu só com o que a pessoa pode ver. */
export function visibleSections(can: (p: Permission) => boolean) {
  return NAV_SECTIONS.map((section) => ({ ...section, items: section.items.filter((i) => !i.permission || can(i.permission)) })).filter(
    (section) => section.items.length > 0,
  )
}
