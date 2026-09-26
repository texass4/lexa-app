/** POST /api/ai/office/overview — panorama do escritório (cada seção só com os módulos que a pessoa vê). */

import { aiRoute } from "@/lib/ai/http"
import { officeOverview } from "@/lib/ai/services/office"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const POST = aiRoute(null, ({ deps }) => officeOverview(deps))
