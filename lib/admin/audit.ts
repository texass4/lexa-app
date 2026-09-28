import type { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { ProfileRow } from "@/lib/auth/profile"
import type { AuditSeverity } from "./catalog"

/** IP de quem fez a requisição, quando o proxy/CDN informa. */
export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip") || undefined
}

export interface AuditInput {
  action: string
  severity?: AuditSeverity
  /** Quem agiu. Sem ele, o evento é do sistema. */
  actor?: Pick<ProfileRow, "id" | "name" | "email" | "role"> | null
  organizationId?: string | null
  target?: { type: string; id?: string; label?: string }
  summary?: string
  metadata?: Record<string, unknown>
}

type Actor = NonNullable<AuditInput["actor"]>

/** Auditoria de uma alteração de usuário, com a ação mais relevante do que mudou. */
export function auditMemberPatch(
  request: NextRequest,
  actor: Actor,
  organizationId: string,
  member: { id: string; name: string; role?: string; active?: boolean },
  patch: { role?: string; permissions?: unknown; active?: boolean; name?: string; jobTitle?: string | null },
) {
  const [action, severity, summary]: [string, AuditSeverity, string] =
    patch.active !== undefined
      ? ["user.status_changed", "warning", `${member.name} ${patch.active ? "reativado(a)" : "desativado(a)"}`]
      : patch.role !== undefined
        ? ["user.role_changed", "warning", `Papel de ${member.name} alterado para ${patch.role}`]
        : patch.permissions !== undefined
          ? ["user.permissions_changed", "warning", `Permissões de ${member.name} ${patch.permissions === null ? "restauradas ao padrão" : "personalizadas"}`]
          : ["user.updated", "info", `Dados de ${member.name} alterados`]
  return recordAudit(request, {
    action,
    severity,
    actor,
    organizationId,
    target: { type: "user", id: member.id, label: member.name },
    summary,
    metadata: { changes: Object.keys(patch), ...(patch.role !== undefined ? { role: patch.role } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) },
  })
}

/**
 * Registra um evento de auditoria. Nunca derruba a ação principal: se a gravação
 * falhar, só fica no log do servidor.
 */
export async function recordAudit(request: NextRequest | Request | null, input: AuditInput) {
  try {
    const { error } = await getSupabaseAdmin()
      .from("audit_logs")
      .insert({
        action: input.action,
        severity: input.severity ?? "info",
        actor_id: input.actor?.id ?? null,
        actor_name: input.actor?.name ?? null,
        actor_email: input.actor?.email ?? null,
        actor_role: input.actor?.role ?? null,
        organization_id: input.organizationId ?? null,
        target_type: input.target?.type ?? null,
        target_id: input.target?.id ?? null,
        target_label: input.target?.label ?? null,
        summary: input.summary ?? null,
        metadata: input.metadata ?? {},
        ip: request ? (clientIp(request) ?? null) : null,
        user_agent: request?.headers.get("user-agent")?.slice(0, 300) ?? null,
      })
    if (error) console.error("[audit]", input.action, error.message)
  } catch (error) {
    console.error("[audit]", input.action, error)
  }
}
