import { Building2, Gauge, Layers, LayoutDashboard, ScrollText, Settings2, UsersRound, Wallet, type LucideIcon } from "lucide-react"

export type BadgeKey = "pending" | "usage" | "pastDue"

export interface AdminNavItem {
  href: string
  label: string
  icon: LucideIcon
  description: string
  badge?: BadgeKey
}

export const ADMIN_NAV: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Visão geral",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, description: "Indicadores e pendências da plataforma" }],
  },
  {
    label: "Operação",
    items: [
      { href: "/admin/escritorios", label: "Escritórios", icon: Building2, description: "Cadastros, status, planos e equipes", badge: "pending" },
      { href: "/admin/usuarios", label: "Usuários", icon: UsersRound, description: "Todas as pessoas de todos os escritórios" },
      { href: "/admin/uso", label: "Uso da plataforma", icon: Gauge, description: "Consumo de cada escritório contra o limite", badge: "usage" },
    ],
  },
  {
    label: "Negócio",
    items: [
      { href: "/admin/planos", label: "Planos e assinaturas", icon: Layers, description: "Catálogo, preços, limites e recursos" },
      { href: "/admin/financeiro", label: "Financeiro", icon: Wallet, description: "Receita recorrente, assinaturas e pagamentos", badge: "pastDue" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/atividade", label: "Atividade / Logs", icon: ScrollText, description: "Auditoria de acessos e alterações" },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings2, description: "Plataforma, recursos, limites e manutenção" },
    ],
  },
]

export const ADMIN_ITEMS = ADMIN_NAV.flatMap((s) => s.items)

export const isAdminActive = (pathname: string, href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`))

export const adminRouteMeta = (pathname: string) =>
  [...ADMIN_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => isAdminActive(pathname, i.href)) ?? ADMIN_ITEMS[0]
