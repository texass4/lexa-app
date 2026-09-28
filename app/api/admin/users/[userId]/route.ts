import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { moveMember } from "@/lib/auth/members"
import { requireAdmin } from "@/lib/admin/guard"
import { recordAudit } from "@/lib/admin/audit"

type Context = { params: Promise<{ userId: string }> }

/** Move a pessoa para outro escritório (opcionalmente com outro papel). */
export const PATCH = route<Context>(async (request, { params }) => {
  const { profile } = await requireAdmin(request)
  const { userId } = await params
  const body = await readJson<{ organizationId?: string; role?: string }>(request)
  if (!body.organizationId) throw new HttpError(400, "Informe o escritório de destino.")

  const admin = getSupabaseAdmin()
  const { data: current } = await admin
    .from("profiles")
    .select("organization_id, name, email")
    .eq("id", userId)
    .maybeSingle<{ organization_id: string | null; name: string; email: string }>()
  if (!current?.organization_id) throw new HttpError(404, "Usuário não encontrado.")

  const member = await moveMember(current.organization_id, body.organizationId, userId, body.role)
  const { data: orgs } = await admin.from("organizations").select("id, name").in("id", [current.organization_id, body.organizationId])
  const name = (id: string) => (orgs ?? []).find((o) => o.id === id)?.name ?? id
  const entry = {
    action: "user.moved",
    severity: "critical" as const,
    actor: profile,
    target: { type: "user", id: userId, label: current.name },
    summary: `${current.name} movido(a) de ${name(current.organization_id)} para ${name(body.organizationId)}`,
    metadata: { from: current.organization_id, to: body.organizationId, role: member.role },
  }
  // Aparece na atividade dos dois escritórios.
  await recordAudit(request, { ...entry, organizationId: current.organization_id })
  await recordAudit(request, { ...entry, organizationId: body.organizationId })
  return NextResponse.json({ member })
})
