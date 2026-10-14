/** GET /api/jurisprudence/facets — opções dos filtros (valores que existem na base). */

import { createTtlCache } from "@/lib/services/jurisprudence/cache"
import { jurisprudenceRoute, respond } from "@/lib/services/jurisprudence/http"
import type { Facet } from "@/lib/services/jurisprudence/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// A base muda uma vez por dia: as opções podem ficar alguns minutos em memória.
const cache = createTtlCache<Record<string, Facet[]>>(1, 10 * 60_000)

export function GET() {
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      const facets = cache.get("all") ?? (await repo.facets())
      cache.set("all", facets)
      return respond({ facets })
    },
    { requireSource: true, where: "filtros" },
  )
}
