import { NextResponse } from "next/server"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { recordAudit } from "@/lib/admin/audit"
import { loadSettings, saveSettings } from "@/lib/admin/platform"
import { sanitizeSettings } from "@/lib/admin/settings"
import { loadPlans } from "@/lib/admin/data"
import { isEmailConfigured } from "@/lib/services/email"
import { describeAIModels } from "@/lib/ai/config"

export const GET = route(async (request) => {
  await requireAdmin(request)
  const [settings, plans] = await Promise.all([loadSettings({ fresh: true }), loadPlans()])
  return NextResponse.json({
    settings,
    plans: plans.map((p) => ({ name: p.name, status: p.status })),
    // Só se existem, nunca o valor: segredos ficam nas variáveis de ambiente.
    secrets: {
      ai: !!process.env.GEMINI_API_KEY?.trim(),
      whatsapp: !!(process.env.ZAPI_TOKEN || process.env.WHATSAPP_API_TOKEN),
      datajud: !!process.env.DATAJUD_API_KEY,
      email: isEmailConfigured(),
    },
    // Provedor e modelos em uso (do ambiente: AI_MODEL, AI_MODEL_LIGHT) — nunca a chave.
    ai: describeAIModels(),
  })
})

/** Salva a configuração inteira (validada). Manutenção gera registro crítico. */
export const PUT = route(async (request) => {
  const { profile } = await requireAdmin(request)
  const next = sanitizeSettings(await readJson<unknown>(request))
  const [current, plans] = await Promise.all([loadSettings({ fresh: true }), loadPlans()])
  const plan = plans.find((p) => p.name === next.general.defaultPlan)
  if (!plan || plan.status !== "active") throw new HttpError(400, "Escolha um plano ativo como plano padrão de novos cadastros.")

  await saveSettings(next, profile.id)

  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]))
  if (next.maintenance.enabled !== current.maintenance.enabled) {
    await recordAudit(request, {
      action: "settings.maintenance",
      severity: "critical",
      actor: profile,
      target: { type: "settings", label: "Manutenção" },
      summary: next.maintenance.enabled ? "Modo manutenção LIGADO — escritórios sem acesso" : "Modo manutenção desligado",
    })
  }
  const others = changed.filter((k) => k !== "maintenance")
  if (others.length) {
    await recordAudit(request, {
      action: "settings.updated",
      severity: "warning",
      actor: profile,
      target: { type: "settings", label: "Configurações" },
      summary: `Configurações alteradas: ${others.join(", ")}`,
      metadata: { sections: others },
    })
  }
  return NextResponse.json({ settings: next })
})
