/**
 * GET /api/processes/monitoring — estado real do monitoramento automático, para o
 * cartão de Configurações do escritório. Só o estado da plataforma e a hora da
 * última verificação: nenhum dado de outro escritório.
 */

import { NextResponse } from "next/server"
import { requireMember, route } from "@/lib/auth/server"
import { loadSettings } from "@/lib/admin/platform"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { loadMonitorStatus, monitorSetup } from "@/lib/services/processos/monitor-status"

export const dynamic = "force-dynamic"

export const GET = route(async () => {
  await requireMember("processes.view")
  const settings = await loadSettings()
  const status = await loadMonitorStatus(getSupabaseAdmin(), monitorSetup(settings.features.datajud))
  return NextResponse.json(
    { health: status.health, lastHealthyRunAt: status.lastHealthyRunAt, resumeAfter: status.resumeAfter },
    { headers: { "Cache-Control": "no-store" } },
  )
})
