import { BookOpen, CalendarRange, Compass, FileText, FolderKanban, Home, Inbox, ListChecks, Settings, Waypoints, type LucideIcon } from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon; count?: "inbox" | "overdue" }
export type NavGroup = { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    label: "Agora",
    items: [
      { href: "/", label: "Início", icon: Home },
      { href: "/inbox", label: "Caixa de entrada", icon: Inbox, count: "inbox" },
      { href: "/tasks", label: "Tarefas", icon: ListChecks, count: "overdue" },
      { href: "/planning", label: "Planejamento", icon: CalendarRange },
    ],
  },
  {
    label: "Escrita",
    items: [
      { href: "/journal", label: "Diário", icon: BookOpen },
      { href: "/pages", label: "Páginas", icon: FileText },
    ],
  },
  {
    label: "Estrutura",
    items: [
      { href: "/projects", label: "Projetos", icon: FolderKanban },
      { href: "/areas", label: "Áreas", icon: Compass },
      { href: "/canvas", label: "Quadros", icon: Waypoints },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Configurações", icon: Settings }

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
