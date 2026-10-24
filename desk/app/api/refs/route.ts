import { apiHandler, readJson } from "@/lib/api"
import { getRequestContext } from "@/lib/context"
import { parseRefKey, type Ref } from "@/lib/domain/refs"
import { resolveRefs } from "@/lib/services/refs"

/** Estado atual de registros referenciados (canvas e editor atualizam por aqui). */
export async function POST(request: Request) {
  return apiHandler(async () => {
    const body = (await readJson(request, 200_000)) as { refs?: unknown }
    const keys = Array.isArray(body?.refs) ? body.refs.filter((k): k is string => typeof k === "string").slice(0, 2000) : []
    const refs = keys.map(parseRefKey).filter((r): r is Ref => r !== null)
    const { today } = await getRequestContext()
    return { summaries: await resolveRefs(refs, today), requested: keys }
  })
}
