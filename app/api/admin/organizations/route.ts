import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, requireSuperAdmin, route } from "@/lib/auth/server"
import { inviteMember } from "@/lib/auth/members"
import { toOrganization, type OrganizationRow, type ProfileRow } from "@/lib/auth/profile"

const PLANS = ["Essencial", "Profissional", "Escritório"]

/** Todos os escritórios, com número de usuários e o(s) sócio(s). */
export const GET = route(async () => {
  await requireSuperAdmin()
  const admin = getSupabaseAdmin()
  const [{ data: orgs, error }, { data: profiles }] = await Promise.all([
    admin.from("organizations").select("*").order("created_at", { ascending: false }),
    admin.from("profiles").select("id, organization_id, role, name, email, active").not("organization_id", "is", null),
  ])
  if (error) throw error
  const people = (profiles ?? []) as Pick<ProfileRow, "id" | "organization_id" | "role" | "name" | "email" | "active">[]
  const organizations = (orgs as OrganizationRow[]).map((row) => {
    const members = people.filter((p) => p.organization_id === row.id)
    return {
      ...toOrganization(row),
      memberCount: members.length,
      activeCount: members.filter((m) => m.active).length,
      owners: members.filter((m) => m.role === "owner").map((m) => ({ name: m.name, email: m.email })),
    }
  })
  return NextResponse.json({ organizations })
})

/** Cria um escritório já ativo e convida o Sócio/Proprietário. */
export const POST = route(async (request) => {
  await requireSuperAdmin()
  const body = await readJson<{ name?: string; cnpj?: string; plan?: string; ownerName?: string; ownerEmail?: string }>(request)
  const name = body.name?.trim() ?? ""
  if (name.length < 2) throw new HttpError(400, "Informe o nome do escritório.")
  const plan = PLANS.includes(body.plan ?? "") ? body.plan : "Essencial"

  const admin = getSupabaseAdmin()
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name, cnpj: body.cnpj?.trim() || null, plan, status: "active", approved_at: new Date().toISOString() })
    .select("*")
    .single<OrganizationRow>()
  if (error) throw error

  try {
    await inviteMember(request, org.id, { name: body.ownerName, email: body.ownerEmail, role: "owner" })
  } catch (inviteError) {
    await admin.from("organizations").delete().eq("id", org.id)
    throw inviteError
  }
  return NextResponse.json({ organization: toOrganization(org) }, { status: 201 })
})
