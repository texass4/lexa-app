/**
 * POST /api/processes/:id/jurisprudence/related — pesquisa decisões a partir do que o
 * processo realmente tem (assunto, tipo de ação, classe, área). Só quando a pessoa pede:
 * nada roda ao abrir o processo. Corpo opcional: `{ page }`.
 */

import { createSupabaseServer } from "@/lib/supabase/server"
import { JurisprudenceError } from "@/lib/services/jurisprudence/errors"
import { jurisprudenceRoute, PROCESS_ID, readJson, respond } from "@/lib/services/jurisprudence/http"
import { readProcess } from "@/lib/services/jurisprudence/process-access"
import { createIndexedProvider } from "@/lib/services/jurisprudence/provider"
import { relatedQueryForProcess, resultSentence } from "@/lib/services/jurisprudence/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, context: RouteContext<"/api/processes/[id]/jurisprudence/related">) {
  const { id } = await context.params
  return jurisprudenceRoute(
    "processes.view",
    async ({ repo }) => {
      if (!PROCESS_ID.test(id)) throw new JurisprudenceError("NOT_FOUND", "processo inválido")
      const body = await readJson(request)
      const process = await readProcess(await createSupabaseServer(), id)
      const query = relatedQueryForProcess(process)
      if (query.missing) return respond({ query, results: [], total: 0, page: 1, pageSize: 10, pages: 1, savedIds: [], sentence: query.missing })
      const page = await createIndexedProvider(repo).search({
        text: query.text,
        filters: query.filters,
        page: typeof body.page === "number" ? body.page : 1,
        pageSize: 10,
      })
      const saved = await repo.savedIds(page.results.map((r) => r.id))
      return respond({ query, ...page, savedIds: [...saved.keys()], sentence: resultSentence(page.total) })
    },
    { requireSource: true, rateLimit: true, where: "relacionadas" },
  )
}
