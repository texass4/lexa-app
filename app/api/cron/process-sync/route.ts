/**
 * GET|POST /api/cron/process-sync — monitoramento automático de processos (Etapa 5):
 * movimentações novas entram no processo, com uma atividade quando há novidade.
 *
 * Chamada pelo agendador da hospedagem (ex.: a cada hora), nunca pelo navegador.
 * Exige `Authorization: Bearer <CRON_SECRET>` — o mesmo formato que o Vercel Cron
 * envia quando `CRON_SECRET` está definida. Sem o segredo configurado no servidor,
 * a rota não roda para ninguém.
 *
 * Quem decide o que consultar e quando é o banco + `monitoring-policy.ts`; esta
 * rota só autentica, monta as dependências e devolve o resumo da execução (sem
 * nenhum dado de escritório).
 */

import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { loadSettings } from "@/lib/admin/platform"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { supabaseLookupStore } from "@/lib/services/processos/lookup-cache"
import { FRESH_FOR_MS } from "@/lib/services/processos/lookup-service"
import { runProcessMonitor, type RunRecord } from "@/lib/services/processos/monitor"
import { supabaseMonitorRepository } from "@/lib/services/processos/monitor-store"
import { monitorConfig, OFFICE_TIME_ZONE, startOfDayIn } from "@/lib/services/processos/monitoring-policy"
import { processLookup } from "@/lib/services/processos/process-lookup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** Teto da plataforma; a execução para de começar consultas bem antes (`PROCESS_SYNC_TIME_BUDGET_MS`). */
export const maxDuration = 300

const NO_STORE = { "Cache-Control": "no-store" }

/** Segredo curto demais é tratado como ausente. */
const MIN_SECRET_LENGTH = 16

const digest = (value: string) => createHash("sha256").update(value).digest()

function authorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  // Comparação em tempo constante (sobre o hash, que tem tamanho fixo).
  return token.length > 0 && timingSafeEqual(digest(token), digest(secret))
}

async function handle(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  if (secret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json({ ok: false, error: "Monitoramento não configurado." }, { status: 503, headers: NO_STORE })
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401, headers: NO_STORE })
  }

  const settings = await loadSettings({ fresh: true })
  const maintenance = settings.maintenance.enabled ? "Plataforma em manutenção." : null
  const admin = getSupabaseAdmin()
  const store = supabaseLookupStore(admin)

  let run: RunRecord | null = null
  try {
    run = await runProcessMonitor({
      repo: supabaseMonitorRepository(admin),
      config: monitorConfig(),
      disabledReason: !settings.features.datajud ? "A consulta automática de processos está desativada pela administração." : maintenance,
      lookup: ({ organizationId, cnj }) => {
        // Consulta de hoje (de qualquer pessoa do escritório) vale: nada de ir à fonte duas vezes no mesmo dia.
        const now = new Date()
        const maxAgeMs = Math.max(FRESH_FOR_MS, now.getTime() - startOfDayIn(now, OFFICE_TIME_ZONE).getTime())
        return processLookup.lookup({ organizationId, cnj, store, maxAgeMs })
      },
    })
  } catch (error) {
    console.error("[process-monitor] a execução não pôde ser registrada", error)
  }

  if (!run) {
    return NextResponse.json({ ok: false, error: "Falha ao executar o monitoramento." }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: run.status !== "failed", run }, { headers: NO_STORE })
}

export const GET = handle
export const POST = handle
