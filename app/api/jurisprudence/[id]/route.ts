/**
 * GET /api/jurisprudence/:id — a decisão completa (como está na base), se o
 * escritório a salvou e a quais processos dele está vinculada.
 */

import { jurisprudenceRoute, respond } from "@/lib/services/jurisprudence/http"
import { createIndexedProvider } from "@/lib/services/jurisprudence/provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: RouteContext<"/api/jurisprudence/[id]">) {
  const { id } = await context.params
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      const decision = await createIndexedProvider(repo, { cache: null }).getDecision(id)
      const [saved, linkedProcessIds] = await Promise.all([repo.savedIds([id]), repo.linkedProcessIds(id)])
      return respond({ decision, saved: saved.get(id) ?? null, linkedProcessIds })
    },
    { where: "decisão" },
  )
}
