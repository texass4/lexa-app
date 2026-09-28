import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { recordAudit } from "@/lib/admin/audit"
import { toPlan, type PlanRow } from "@/lib/admin/data"
import { loadSettings, saveSettings } from "@/lib/admin/platform"
import { isUniqueViolation, planColumns, type PlanBody } from "../input"

type Context = { params: Promise<{ id: string }> }

/**
 * Editar ou ativar/desativar um plano. Desativar tira o plano das opções para novos
 * escritórios; quem já está nele continua. Renomear atualiza os escritórios (FK em cascata).
 */
export const PATCH = route<Context>(async (request, { params }) => {
  const { profile } = await requireAdmin(request)
  const { id } = await params
  const admin = getSupabaseAdmin()
  const { data: current } = await admin.from("plans").select("*").eq("id", id).maybeSingle<PlanRow>()
  if (!current) throw new HttpError(404, "Plano não encontrado.")

  const columns = planColumns(await readJson<PlanBody>(request), true)
  if (columns.status === "inactive" && current.status === "active") {
    const settings = await loadSettings()
    if (settings.general.defaultPlan === current.name) {
      throw new HttpError(400, "Este é o plano padrão de novos cadastros. Escolha outro plano padrão em Configurações antes de desativá-lo.")
    }
  }
  if (!Object.keys(columns).length) return NextResponse.json({ plan: toPlan(current) })

  const { data, error } = await admin.from("plans").update(columns).eq("id", id).select("*").single<PlanRow>()
  if (isUniqueViolation(error)) throw new HttpError(409, "Já existe um plano com esse nome.")
  if (error) throw error

  // O plano padrão de cadastro é guardado pelo nome: acompanha a renomeação.
  if (current.name !== data.name) {
    const settings = await loadSettings({ fresh: true })
    if (settings.general.defaultPlan === current.name) {
      await saveSettings({ ...settings, general: { ...settings.general, defaultPlan: data.name } }, profile.id)
    }
  }

  const statusOnly = Object.keys(columns).length === 1 && "status" in columns
  await recordAudit(request, {
    action: statusOnly ? "plan.status_changed" : "plan.updated",
    severity: statusOnly || "price_cents" in columns ? "warning" : "info",
    actor: profile,
    target: { type: "plan", id, label: data.name },
    summary: statusOnly ? `Plano ${data.name} ${data.status === "active" ? "ativado" : "desativado"}` : `Plano ${data.name} alterado`,
    metadata: {
      fields: Object.keys(columns),
      ...("price_cents" in columns ? { fromCents: current.price_cents, toCents: data.price_cents } : {}),
      ...(current.name !== data.name ? { renamedFrom: current.name } : {}),
    },
  })
  return NextResponse.json({ plan: toPlan(data) })
})
