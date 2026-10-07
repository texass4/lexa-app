/**
 * POST /api/jurisprudence/search — pesquisa na base indexada (server-side).
 * Corpo: `{ text, filters?, sort?, page? }`. 20 por página; limite por pessoa.
 * Devolve também quais resultados o escritório já salvou.
 */

import { jurisprudenceRoute, readJson, respond } from "@/lib/services/jurisprudence/http"
import { createIndexedProvider } from "@/lib/services/jurisprudence/provider"
import type { JurisprudenceQuery } from "@/lib/services/jurisprudence/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function POST(request: Request) {
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      const body = (await readJson(request)) as unknown as JurisprudenceQuery
      const page = await createIndexedProvider(repo).search(body)
      const saved = await repo.savedIds(page.results.map((r) => r.id))
      return respond({ ...page, savedIds: [...saved.keys()] })
    },
    { requireSource: true, rateLimit: true, where: "pesquisa" },
  )
}
