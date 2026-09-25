import type { Organization, User } from "@/types"
import type { Role } from "./permissions"

/** Linha de `public.profiles` como vem do Supabase. */
export interface ProfileRow {
  id: string
  organization_id: string | null
  role: Role
  permissions: string[] | null
  name: string
  email: string
  phone: string | null
  job_title: string | null
  oab: string | null
  avatar_url: string | null
  active: boolean
  created_at: string
}

/** Linha de `public.organizations`. */
export interface OrganizationRow {
  id: string
  name: string
  legal_name: string | null
  cnpj: string | null
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  plan: Organization["plan"]
  status: Organization["status"]
  created_at: string
  approved_at: string | null
}

/** Membro com dados de acesso — só para quem gerencia usuários. */
export interface MemberAccess extends User {
  lastSignInAt?: string
  /** Convidado que ainda não definiu a senha. */
  invitePending: boolean
}

export function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    organizationId: row.organization_id ?? "",
    createdAt: row.created_at,
    name: row.name,
    firstName: row.name.split(/\s+/)[0] ?? row.name,
    role: row.role,
    email: row.email,
    phone: row.phone ?? "",
    jobTitle: row.job_title ?? undefined,
    oab: row.oab ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    active: row.active,
    permissions: row.permissions,
  }
}

export function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name ?? "",
    cnpj: row.cnpj ?? "",
    city: row.city ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    plan: row.plan,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
  }
}
