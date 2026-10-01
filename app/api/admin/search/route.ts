import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { matches } from "@/lib/core/format"
import type { OrgStatus } from "@/lib/admin/catalog"

/** Busca global do Admin: escritórios e usuários por nome, e-mail ou CNPJ. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80)
  if (q.trim().length < 2) return NextResponse.json({ organizations: [], users: [] })
  const admin = getSupabaseAdmin()
  const [{ data: orgs }, { data: people }] = await Promise.all([
    admin.from("organizations").select("id, name, cnpj, email, plan, status"),
    admin.from("profiles").select("id, name, email, role, organization_id").not("organization_id", "is", null),
  ])
  const orgList = (orgs ?? []) as { id: string; name: string; cnpj: string | null; email: string | null; plan: string; status: OrgStatus }[]
  const orgName = new Map(orgList.map((o) => [o.id, o.name]))
  const digits = q.replace(/\D/g, "")
  return NextResponse.json({
    organizations: orgList
      .filter((o) => matches(q, o.name, o.email ?? "") || (digits.length >= 3 && (o.cnpj ?? "").replace(/\D/g, "").includes(digits)))
      .slice(0, 6)
      .map((o) => ({ id: o.id, name: o.name, plan: o.plan, status: o.status, cnpj: o.cnpj })),
    users: ((people ?? []) as { id: string; name: string; email: string; role: string; organization_id: string }[])
      .filter((u) => matches(q, u.name, u.email))
      .slice(0, 6)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, organizationId: u.organization_id, organizationName: orgName.get(u.organization_id) ?? "—" })),
  })
})
