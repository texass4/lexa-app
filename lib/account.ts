import type { Organization, User } from "@/types"
import { ROLE_LABELS } from "@/lib/auth/permissions"

/**
 * Conta em uso: o escritório e a pessoa logada.
 *
 * Preenchido pelo `SessionProvider` (`lib/auth/session.tsx`) antes de qualquer tela
 * do app renderizar, a partir da sessão do Supabase. Funções simples (não hooks)
 * para que o store e os formatadores também possam usar.
 */

interface AccountState {
  user: User
  organization: Organization
  members: User[]
}

let state: AccountState | null = null

export function setAccount(next: AccountState | null) {
  state = next
}

function current(): AccountState {
  if (!state) throw new Error("Conta ainda não carregada — use dentro do SessionProvider.")
  return state
}

export const currentUserId = () => current().user.id
export const currentOrgId = () => current().organization.id
export const getOrganization = () => current().organization

/** Membros do escritório. Por padrão só os ativos (listas de responsável, atribuição…). */
export function getMembers({ includeInactive = false } = {}) {
  const { members } = current()
  return includeInactive ? members : members.filter((m) => m.active)
}

const removed = (id: string): User => ({
  id,
  organizationId: "",
  createdAt: "",
  name: "Usuário removido",
  firstName: "Removido",
  role: "staff",
  email: "",
  phone: "",
  active: false,
})

/** Qualquer membro, inclusive inativo; quem saiu do escritório vira "Usuário removido". */
export function getUser(id: string) {
  return current().members.find((u) => u.id === id) ?? removed(id)
}

/** Cargo, ou o nome do papel quando não há cargo. */
export const userTitle = (user: User) => user.jobTitle || ROLE_LABELS[user.role]
