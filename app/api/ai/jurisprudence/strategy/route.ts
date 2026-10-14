/**
 * POST /api/ai/jurisprudence/strategy — { question, processId? } → análise comparativa:
 * o caso (pergunta + processo do escritório) contra precedentes reais da base, com
 * estratégias, contrários, riscos e lacunas. Só decisões recuperadas; citações conferidas.
 */

import { aiRoute } from "@/lib/ai/http"
import { readStrategyInput } from "@/lib/ai/input"
import { analyzeJurisprudenceStrategy } from "@/lib/ai/services/jurisprudence-strategy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute("processes.view", ({ body, deps }) => analyzeJurisprudenceStrategy(deps, readStrategyInput(body)))
