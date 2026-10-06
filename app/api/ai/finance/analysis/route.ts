/** POST /api/ai/finance/analysis — leitura do financeiro (só para quem vê o Financeiro). */

import { aiRoute } from "@/lib/ai/http"
import { financeAnalysis } from "@/lib/ai/services/finance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("finance.view", ({ deps }) => financeAnalysis(deps))
