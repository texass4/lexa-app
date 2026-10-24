import { apiHandler } from "@/lib/api"
import { isRefType, type RefType } from "@/lib/domain/refs"
import { globalSearch } from "@/lib/services/search"

export async function GET(request: Request) {
  return apiHandler(async () => {
    const url = new URL(request.url)
    const q = (url.searchParams.get("q") ?? "").slice(0, 200)
    const types = (url.searchParams.get("types") ?? "")
      .split(",")
      .filter(isRefType) as RefType[]
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 6) || 6))
    return { results: await globalSearch(q, { types: types.length ? types : undefined, limitPerType: limit }) }
  })
}
