/**
 * POST /api/processes/search — consulta um processo por número CNJ.
 *
 * Usada no "Novo processo". Responde com cache fresco na hora; com cache
 * vencido, responde com ele e atualiza em segundo plano (stale-while-revalidate).
 * Toda a conversa com a fonte externa fica em `lib/services/processes/lookup-service.ts`.
 */

import { handleLookup } from "@/lib/services/processes/lookup-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function POST(request: Request) {
  return handleLookup(request, () => ({ staleWhileRevalidate: true }), "search")
}
