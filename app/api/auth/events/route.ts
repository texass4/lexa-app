import { NextResponse } from "next/server"
import { getCaller, readJson, route } from "@/lib/auth/server"
import { recordAudit } from "@/lib/admin/audit"
import { assertSameOrigin } from "@/lib/admin/guard"

/**
 * Registra entrada e saída na auditoria. Quem é vem do cookie de sessão (validado no
 * Supabase), nunca do corpo — ninguém registra evento em nome de outra pessoa.
 */
export const POST = route(async (request) => {
  assertSameOrigin(request)
  const { profile } = await getCaller()
  const { type } = await readJson<{ type?: string }>(request)
  if (type !== "login" && type !== "logout") return NextResponse.json({ error: "Evento inválido." }, { status: 400 })
  await recordAudit(request, {
    action: `auth.${type}`,
    actor: profile,
    organizationId: profile.organization_id,
    target: { type: "user", id: profile.id, label: profile.name },
    summary: type === "login" ? `${profile.name} entrou` : `${profile.name} saiu`,
  })
  return NextResponse.json({ ok: true })
})
