import { HttpError } from "@/lib/auth/server"
import { LIMIT_KEYS, LIMIT_META, sanitizeFeatures, sanitizeLimits } from "@/lib/admin/catalog"

export interface PlanBody {
  name?: string
  description?: string | null
  priceCents?: number
  interval?: string
  limits?: Record<string, unknown>
  features?: unknown
  status?: string
  sortOrder?: number
  gatewayProductId?: string | null
  gatewayPriceId?: string | null
}

/** Corpo do formulário → colunas de `public.plans`. `partial` = edição (só o que veio). */
export function planColumns(body: PlanBody, partial: boolean) {
  const out: Record<string, unknown> = {}
  if (!partial || body.name !== undefined) {
    const name = body.name?.trim() ?? ""
    if (name.length < 2 || name.length > 60) throw new HttpError(400, "O nome do plano precisa ter entre 2 e 60 caracteres.")
    out.name = name
  }
  if (body.description !== undefined) out.description = body.description?.trim().slice(0, 300) || null
  if (!partial || body.priceCents !== undefined) {
    const price = Number(body.priceCents ?? 0)
    if (!Number.isFinite(price) || price < 0 || price > 100_000_000) throw new HttpError(400, "Preço inválido.")
    out.price_cents = Math.round(price)
  }
  if (body.interval !== undefined) {
    if (body.interval !== "month" && body.interval !== "year") throw new HttpError(400, "Periodicidade inválida.")
    out.billing_interval = body.interval
  }
  if (body.limits !== undefined) {
    const limits = sanitizeLimits(body.limits)
    for (const key of LIMIT_KEYS) if (key in limits) out[LIMIT_META[key].column] = limits[key]
  }
  if (body.features !== undefined) out.features = sanitizeFeatures(body.features)
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "inactive") throw new HttpError(400, "Status inválido.")
    out.status = body.status
  }
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) out.sort_order = Math.round(Number(body.sortOrder))
  if (body.gatewayProductId !== undefined) out.gateway_product_id = body.gatewayProductId?.trim() || null
  if (body.gatewayPriceId !== undefined) out.gateway_price_id = body.gatewayPriceId?.trim() || null
  return out
}

export const isUniqueViolation = (error: { code?: string } | null) => error?.code === "23505"
