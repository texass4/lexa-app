/** GET /api/processes/:id/jurisprudence — decisões vinculadas a este processo. */

import { jurisprudenceRoute, PROCESS_ID, respond } from "@/lib/services/jurisprudence/http"
import { JurisprudenceError } from "@/lib/services/jurisprudence/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: RouteContext<"/api/processes/[id]/jurisprudence">) {
  const { id } = await context.params
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      if (!PROCESS_ID.test(id)) throw new JurisprudenceError("NOT_FOUND", "processo inválido")
      return respond({ entries: await repo.listLinked(id) })
    },
    { where: "vinculadas" },
  )
}
