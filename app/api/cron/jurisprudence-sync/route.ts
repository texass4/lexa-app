/**
 * GET|POST /api/cron/jurisprudence-sync — alimenta a base de jurisprudência a partir
 * das fontes oficiais configuradas (`JURISPRUDENCIA_FONTES`). Ver docs/JURISPRUDENCIA.md.
 *
 * Chamada pelo agendador da hospedagem (sugestão: 1 vez por dia), nunca pelo navegador.
 * Exige `Authorization: Bearer <CRON_SECRET>` (o mesmo segredo de `/api/cron/process-sync`).
 * Idempotente: chamar de novo só lê arquivos ainda não lidos. Devolve só contagens.
 */

import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { loadSettings } from "@/lib/admin/platform"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { configuredSources, jurisprudenceConfig } from "@/lib/services/jurisprudence/config"
import { clearSearchCache } from "@/lib/services/jurisprudence/provider"
import { supabaseSyncRepository } from "@/lib/services/jurisprudence/store"
import { runJurisprudenceSync, type SyncSummary } from "@/lib/services/jurisprudence/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const NO_STORE = { "Cache-Control": "no-store" }
/** Não começa download novo depois disso (a rota tem teto de `maxDuration`). */
const TIME_BUDGET_MS = 240_000
const MIN_SECRET_LENGTH = 16

const digest = (value: string) => createHash("sha256").update(value).digest()

function authorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  return token.length > 0 && timingSafeEqual(digest(token), digest(secret))
}

async function handle(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim()
  if (secret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json({ ok: false, error: "Agendador não configurado." }, { status: 503, headers: NO_STORE })
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401, headers: NO_STORE })
  }

  const config = jurisprudenceConfig()
  if (!config.enabled) return NextResponse.json({ ok: true, skipped: "Nenhuma fonte de jurisprudência configurada." }, { headers: NO_STORE })
  const settings = await loadSettings({ fresh: true })
  if (settings.maintenance.enabled) return NextResponse.json({ ok: true, skipped: "Plataforma em manutenção." }, { headers: NO_STORE })

  const started = Date.now()
  const repo = supabaseSyncRepository(getSupabaseAdmin())
  const runs: SyncSummary[] = []
  for (const source of configuredSources(config)) {
    runs.push(
      await runJurisprudenceSync({
        source,
        repo,
        initialFiles: config.stj.initialFiles,
        maxFiles: config.stj.filesPerRun,
        deadline: started + TIME_BUDGET_MS,
      }),
    )
  }
  if (runs.some((run) => run.created || run.updated)) clearSearchCache()
  const ok = runs.every((run) => run.status !== "failed")
  // Só contagens e mensagens da fonte — nenhum dado de escritório.
  return NextResponse.json({ ok, runs }, { status: ok ? 200 : 502, headers: NO_STORE })
}

export const GET = handle
export const POST = handle
