/**
 * Papéis e permissões do LEXA. Os padrões por papel precisam ser iguais a
 * `role_defaults` em `supabase/migrations/0001_lexa_auth.sql` — o banco (RLS) é quem
 * garante; aqui é só para a interface esconder o que a pessoa não pode usar.
 */

export const MODULES = [
  { key: "clients", label: "Clientes" },
  { key: "processes", label: "Processos" },
  { key: "tasks", label: "Tarefas" },
  { key: "agenda", label: "Agenda" },
  { key: "documents", label: "Documentos" },
  { key: "finance", label: "Financeiro" },
] as const

export type ModuleKey = (typeof MODULES)[number]["key"]

export const ADMIN_PERMISSIONS = [
  { key: "office.manage", label: "Editar dados do escritório" },
  { key: "users.manage", label: "Gerenciar usuários e permissões" },
] as const

export type Permission = `${ModuleKey}.view` | `${ModuleKey}.edit` | (typeof ADMIN_PERMISSIONS)[number]["key"]

export const ALL_PERMISSIONS: Permission[] = [
  ...MODULES.flatMap((m) => [`${m.key}.view`, `${m.key}.edit`] as Permission[]),
  ...ADMIN_PERMISSIONS.map((p) => p.key),
]

export type Role = "super_admin" | "owner" | "lawyer" | "staff"
export type MemberRole = Exclude<Role, "super_admin">

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  owner: "Sócio/Proprietário",
  lawyer: "Advogado",
  staff: "Colaborador/Estagiário",
}

export const MEMBER_ROLES: MemberRole[] = ["owner", "lawyer", "staff"]

const WORK: Permission[] = [
  "clients.view",
  "clients.edit",
  "processes.view",
  "processes.edit",
  "tasks.view",
  "tasks.edit",
  "agenda.view",
  "agenda.edit",
  "documents.view",
  "documents.edit",
]

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  super_admin: [],
  owner: ALL_PERMISSIONS,
  lawyer: [...WORK, "finance.view"],
  staff: WORK,
}

const KNOWN = new Set<string>(ALL_PERMISSIONS)

/** Mantém só permissões conhecidas e sem repetição — entrada de formulário ou do banco. */
export function sanitizePermissions(list: readonly string[]): Permission[] {
  return ALL_PERMISSIONS.filter((p) => list.includes(p) && KNOWN.has(p))
}

export function effectivePermissions(role: Role, permissions?: readonly string[] | null): Permission[] {
  if (role === "owner") return ALL_PERMISSIONS
  return permissions ? sanitizePermissions(permissions) : ROLE_DEFAULTS[role]
}

/** Mesma regra de `has_perm` no banco. */
export function hasPermission(profile: { role: Role; permissions?: readonly string[] | null; active: boolean }, permission: Permission) {
  if (!profile.active || profile.role === "super_admin") return false
  return effectivePermissions(profile.role, profile.permissions).includes(permission)
}
