import {
  BookOpenText,
  CalendarDays,
  FileText,
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
  badgeKey?: "tasks" | "processes" | "prazos" | "agenda"
  /** Sem ela, o item some do menu e a rota mostra "sem acesso". */
  permission?: Permission
  /** Telas dentro deste item (abrem pela setinha ao lado dele). */
  children?: NavItem[]
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Trabalho",
    items: [
      { href: "/dashboard", label: "Início", icon: LayoutGrid },
      {
        href: "/processos",
        label: "Processos",
        icon: Scale,
        badgeKey: "processes",
        permission: "processes.view",
      },
      { href: "/clientes", label: "Clientes", icon: UsersRound, permission: "clients.view" },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, badgeKey: "agenda", permission: "agenda.view" },
      {
        href: "/tarefas",
        label: "Tarefas",
        icon: ListChecks,
        badgeKey: "tasks",
        permission: "tasks.view",
        children: [
          { href: "/tarefas/paginas", label: "Páginas", icon: FileText, permission: "tasks.view" },
          { href: "/tarefas/prazos", label: "Prazos", icon: Hourglass, badgeKey: "prazos", permission: "processes.view" },
        ],
      },
      { href: "/documentos", label: "Documentos", icon: FolderOpen, permission: "documents.view" },
      { href: "/atendimento", label: "Atendimento", icon: MessagesSquare, permission: "whatsapp.view" },
      { href: "/jurisprudencia", label: "Jurisprudência", icon: BookOpenText, permission: "processes.view" },
      { href: "/financeiro", label: "Financeiro", icon: Wallet, permission: "finance.view" },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/configuracoes", label: "Configurações", icon: Settings }],
  },
]

/**
 * Atalhos da barra lateral: listas reais já filtradas (os filtros por URL existem nas telas).
 * O número ao lado é calculado com os dados do escritório (`SidebarShortcuts`).
 */
export interface Shortcut {
  href: string
  label: string
  icon: LucideIcon
  permission: Permission
  countKey: "prazosSemana" | "tarefasHoje" | "processosPrazo" | "documentos"
}

export const SHORTCUTS: Shortcut[] = [
  { href: "/tarefas?filtro=hoje", label: "Tarefas de hoje", icon: ListChecks, permission: "tasks.view", countKey: "tarefasHoje" },
  { href: "/tarefas/prazos?filtro=semana", label: "Prazos da semana", icon: Hourglass, permission: "processes.view", countKey: "prazosSemana" },
  { href: "/processos?filtro=prazos", label: "Processos com prazo", icon: Scale, permission: "processes.view", countKey: "processosPrazo" },
  { href: "/documentos?pasta=recentes", label: "Documentos recentes", icon: FolderOpen, permission: "documents.view", countKey: "documentos" },
]

export const ROUTE_META: Record<string, { title: string; section: string }> = {
  "/dashboard": { title: "Visão geral", section: "Painel" },
  "/clientes": { title: "Clientes", section: "Escritório" },
  "/atendimento": { title: "Central de atendimento", section: "WhatsApp" },
  "/processos": { title: "Processos", section: "Escritório" },
  "/tarefas": { title: "Tarefas", section: "Escritório" },
  "/tarefas/paginas": { title: "Páginas", section: "Tarefas" },
  "/tarefas/prazos": { title: "Prazos", section: "Tarefas" },
  "/agenda": { title: "Agenda", section: "Escritório" },
  "/jurisprudencia": { title: "Jurisprudência", section: "Escritório" },
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
