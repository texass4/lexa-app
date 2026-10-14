/**
 * POST /api/process-enrichment — inicia a consulta processual ("Consultar processo").
 * Corpo: `{ processId }` (processo do cadastro) ou `{ cnj }` (número), e `force` para
 * ignorar a consulta recente. Responde na hora com o id da execução; o trabalho segue
 * no servidor (`after`) e a tela acompanha por GET /api/process-enrichment/:id.
 *
 * GET /api/process-enrichment?processId=… — última consulta de um processo do escritório.
 */

import { after, type NextRequest } from "next/server"
import { loadSettings } from "@/lib/admin/platform"
import { allow } from "@/lib/auth/protection/rate-limit"
import { onlyDigits } from "@/lib/processos/cnj"
import { createSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  ENRICHMENT_RULES,
  PROCESS_ID,
  clientNameOf,
  enrichmentRoute,
  findOfficeProcess,
  readOfficeProcess,
  respond,
} from "@/lib/services/consulta/http"
import { EnrichmentError, processCnj, startEnrichment } from "@/lib/services/consulta/service"
import { productionSources } from "@/lib/services/consulta/sources"
import { latestRunForProcess, supabaseEnrichmentStore } from "@/lib/services/consulta/store"
import type { Process } from "@/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** A consulta continua depois da resposta (fonte principal até ~70 s + complementares). */
export const maxDuration = 120

export function POST(request: NextRequest) {
  return enrichmentRoute("processes.edit", async ({ profile, organizationId }) => {
    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = await request.json()
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
    } catch {
      throw new EnrichmentError("INVALID_CNJ", "corpo inválido")
    }

    const session = await createSupabaseServer()
    let process: Process | null = null
    let cnj: string | undefined
    if (typeof body.processId === "string") {
      if (!PROCESS_ID.test(body.processId)) throw new EnrichmentError("NOT_FOUND", "id de processo inválido")
      process = await readOfficeProcess(session, body.processId)
      if (!process) throw new EnrichmentError("NOT_FOUND", "processo inexistente ou de outro escritório")
      cnj = processCnj(process)
      if (!cnj) throw new EnrichmentError("NO_NUMBER", "processo sem CNJ válido")
    } else if (typeof body.cnj === "string" && body.cnj.length <= 40) {
      cnj = onlyDigits(body.cnj)
      // Validado de novo no serviço; aqui só para não procurar no cadastro por lixo.
      if (cnj.length === 20) process = await findOfficeProcess(session, cnj)
    } else {
      throw new EnrichmentError("INVALID_CNJ", "sem número")
    }

    const admin = getSupabaseAdmin()
    const settings = await loadSettings()
    const result = await startEnrichment(
      {
        organizationId,
        userId: profile.id,
        cnj,
        process,
        clientName: await clientNameOf(session, process?.clientId),
        force: body.force === true,
      },
      {
        store: supabaseEnrichmentStore(admin),
        now: () => new Date(),
        // As duas regras contam (nenhuma é pulada).
        allow: async () => {
          const [user, org] = await Promise.all([allow(ENRICHMENT_RULES.user, profile.id), allow(ENRICHMENT_RULES.organization, organizationId)])
          return user && org
        },
        sources: productionSources({ organizationId, admin, datajudEnabled: settings.features.datajud }),
        defer: (task) => after(() => task),
      },
    )
    return respond(result, result.reused ? 200 : 202)
  })
}

export function GET(request: NextRequest) {
  return enrichmentRoute("processes.view", async () => {
    const processId = request.nextUrl.searchParams.get("processId") ?? ""
    if (!PROCESS_ID.test(processId)) throw new EnrichmentError("NOT_FOUND", "id de processo inválido")
    const run = await latestRunForProcess(await createSupabaseServer(), processId)
    return respond({ run })
  })
}
