/**
 * Decisão salva pelo escritório (só a referência — a decisão não é copiada).
 *   POST   { notes? } → salva (de novo: atualiza as observações)
 *   PATCH  { notes }  → observações
 *   DELETE            → remove das salvas
 */

import { JurisprudenceError } from "@/lib/services/jurisprudence/errors"
import { jurisprudenceRoute, readJson, respond } from "@/lib/services/jurisprudence/http"
import { isUuid } from "@/lib/services/jurisprudence/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = RouteContext<"/api/jurisprudence/[id]/save">

function notesOf(body: Record<string, unknown>) {
  if (body.notes === undefined || body.notes === null) return undefined
  if (typeof body.notes !== "string" || body.notes.length > 2000) throw new JurisprudenceError("INVALID_QUERY", "observação inválida")
  return body.notes.trim() || undefined
}

async function target(context: Context) {
  const { id } = await context.params
  if (!isUuid(id)) throw new JurisprudenceError("NOT_FOUND", "id inválido")
  return id
}

export async function POST(request: Request, context: Context) {
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo, organizationId, userId }) => {
      const id = await target(context)
      const notes = notesOf(await readJson(request))
      // A decisão precisa existir e ser visível (a chave estrangeira também confere).
      if (!(await repo.getDecision(id))) throw new JurisprudenceError("NOT_FOUND", "decisão inexistente")
      await repo.save(organizationId, id, userId, notes)
      return respond({ saved: { notes: notes ?? null } })
    },
    { where: "salvar" },
  )
}

export async function PATCH(request: Request, context: Context) {
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      const id = await target(context)
      const notes = notesOf(await readJson(request))
      await repo.updateNotes(id, notes ?? null)
      return respond({ saved: { notes: notes ?? null } })
    },
    { where: "observações" },
  )
}

export async function DELETE(_request: Request, context: Context) {
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      await repo.unsave(await target(context))
      return respond({ saved: null })
    },
    { where: "remover salva" },
  )
}
