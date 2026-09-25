import type { Organization, User } from "@/types"

/**
 * Conta em uso: o escritório e a pessoa logada.
 *
 * Ainda não há login — estes são os dados fixos da conta até existir
 * autenticação. Todo registro criado no LEXA pertence a `ORG_ID` e é salvo no
 * navegador sob essa organização (ver `lib/store/storage.ts`).
 */

export const ORG_ID = "org_almeida"

export const organization: Organization = {
  id: ORG_ID,
  name: "Almeida & Associados",
  legalName: "Almeida & Associados Sociedade de Advogados",
  cnpj: "34.218.907/0001-52",
  city: "Florianópolis, SC",
  address: "Av. Rio Branco, 404 — Sala 1102, Centro, Florianópolis/SC",
  phone: "(48) 3024-7710",
  email: "contato@almeidaassociados.adv.br",
  plan: "Profissional",
  createdAt: "2024-03-04T09:00:00",
}

export const CURRENT_USER_ID = "u_carlos"

export const users: User[] = [
  {
    id: CURRENT_USER_ID,
    organizationId: ORG_ID,
    createdAt: "2024-03-04T09:00:00",
    name: "Carlos Almeida",
    firstName: "Carlos",
    role: "Sócio",
    email: "carlos@almeidaassociados.adv.br",
    phone: "(48) 99812-4410",
    oab: "OAB/SC 28.431",
    permission: "Administrador",
  },
]

export function getUser(id: string) {
  return users.find((u) => u.id === id) ?? users[0]
}
