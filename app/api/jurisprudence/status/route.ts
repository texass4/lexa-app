/** GET /api/jurisprudence/status — a pesquisa está configurada? quantas decisões há na base? */

import { jurisprudenceConfig, SOURCE_INFO } from "@/lib/services/jurisprudence/config"
import { jurisprudenceRoute, respond } from "@/lib/services/jurisprudence/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      const config = jurisprudenceConfig()
      if (!config.enabled) return respond({ configured: false, sources: [], total: 0 })
      const status = await repo.status()
      const sources = config.sources.map((id) => {
        const found = status.find((s) => s.provider === id)
        return { id, ...SOURCE_INFO[id], decisions: found?.decisions ?? 0, lastSuccess: found?.lastSuccess ?? null }
      })
      return respond({ configured: true, sources, total: sources.reduce((acc, s) => acc + s.decisions, 0) })
    },
    { where: "status" },
  )
}
