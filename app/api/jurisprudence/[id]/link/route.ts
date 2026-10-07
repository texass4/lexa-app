/**
 * Vínculo decisão ↔ processo do escritório (exige `processes.edit`).
 *   POST   { processId } → vincula e registra na linha do tempo do processo
 *   DELETE { processId } → desfaz o vínculo
 * O processo é lido com a sessão de quem chama: processo de outro escritório não
 * existe para ela (e a chave composta do banco também recusa).
 */

import { OFFICE_TIME_ZONE } from "@/lib/services/processos/monitoring-policy"
import { toLocalISOIn } from "@/lib/core/dates"
import { createSupabaseServer } from "@/lib/supabase/server"
import { JurisprudenceError } from "@/lib/services/jurisprudence/errors"
import { jurisprudenceRoute, PROCESS_ID, readJson, respond } from "@/lib/services/jurisprudence/http"
import { readProcess } from "@/lib/services/jurisprudence/process-access"
import { isUuid } from "@/lib/services/jurisprudence/store"
import type { Activity } from "@/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = RouteContext<"/api/jurisprudence/[id]/link">

async function input(request: Request, context: Context) {
  const { id } = await context.params
  if (!isUuid(id)) throw new JurisprudenceError("NOT_FOUND", "id inválido")
  const body = await readJson(request)
  if (typeof body.processId !== "string" || !PROCESS_ID.test(body.processId)) throw new JurisprudenceError("INVALID_QUERY", "processo inválido")
  return { id, processId: body.processId }
}

export async function POST(request: Request, context: Context) {
  return jurisprudenceRoute(
    "processes.edit",
    async ({ repo, organizationId, userId, userName }) => {
      const { id, processId } = await input(request, context)
      const supabase = await createSupabaseServer()
      const [process, decision] = await Promise.all([readProcess(supabase, processId), repo.getDecision(id)])
      if (!decision) throw new JurisprudenceError("NOT_FOUND", "decisão inexistente")
      const { created } = await repo.link(organizationId, processId, id, userId)
      if (created) {
        // Linha do tempo do processo (mesma tabela das outras atividades; RLS do escritório).
        const at = toLocalISOIn(new Date(), OFFICE_TIME_ZONE)
        const activity: Activity = {
          id: `act_${crypto.randomUUID()}`,
          organizationId,
          createdAt: at,
          at,
          type: "jurisprudence",
          actor: userName || undefined,
          message: "vinculou uma jurisprudência ao processo.",
          detail: [decision.tribunal, [decision.classCode, decision.processNumber].filter(Boolean).join(" "), decision.court].filter(Boolean).join(" · "),
          actorUserId: userId,
          clientId: process.clientId,
          processId,
          href: `/processos/${processId}`,
        }
        const { error } = await supabase.from("activities").insert({ organization_id: organizationId, id: activity.id, data: activity })
        if (error) console.error("[jurisprudencia] atividade do vínculo não registrada", error.code, error.message)
      }
      return respond({ linked: true, created })
    },
    { where: "vincular" },
  )
}

export async function DELETE(request: Request, context: Context) {
  return jurisprudenceRoute(
    "processes.edit",
    async ({ repo }) => {
      const { id, processId } = await input(request, context)
      await repo.unlink(processId, id)
      return respond({ linked: false })
    },
    { where: "desvincular" },
  )
}
