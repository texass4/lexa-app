/** GET /api/jurisprudence/saved?page= — decisões salvas pelo escritório (RLS: só as dele). */

import { jurisprudenceRoute, respond } from "@/lib/services/jurisprudence/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_SIZE = 20

export function GET(request: Request) {
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      const raw = Number(new URL(request.url).searchParams.get("page"))
      const page = Number.isInteger(raw) && raw >= 1 && raw <= 500 ? raw : 1
      const { entries, total } = await repo.listSaved(PAGE_SIZE, (page - 1) * PAGE_SIZE)
      return respond({ entries, total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) })
    },
    { where: "salvas" },
  )
}
