/** GET /api/ai/status — a LEXA IA está ligada e configurada? Não chama o modelo nem expõe a chave. */

import { NextResponse } from "next/server"
import { requireMember, route } from "@/lib/auth/server"
import { getAIStatus } from "@/lib/ai/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = route(async () => {
  await requireMember()
  return NextResponse.json(getAIStatus())
})
