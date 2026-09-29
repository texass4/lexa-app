/**
 * GET /api/ai/usage — a Íntegra IA do escritório: ligada/configurada, provedor, modelo e
 * uso do mês contra o limite do plano. Não chama o modelo nem expõe a chave.
 */

import { NextResponse } from "next/server"
import { requireMember, route } from "@/lib/auth/server"
import { describeAIModels, getAIStatus } from "@/lib/ai/config"
import { aiMonthlyUsage } from "@/lib/admin/usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const { organizationId } = await requireMember()
  const usage = await aiMonthlyUsage(organizationId)
  const { provider } = describeAIModels()
  return NextResponse.json({ ...getAIStatus(), provider: provider.label, usage })
})
