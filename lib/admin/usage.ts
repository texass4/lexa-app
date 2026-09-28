import { getSupabaseAdmin } from "@/lib/supabase/admin"

export type MeteredKind = "whatsapp_message" | "ai_request"

/**
 * Registra consumo medido de um escritório (mensagem de WhatsApp enviada/recebida,
 * chamada de IA). É o ponto único que as integrações devem chamar — o painel Admin
 * (Uso da plataforma) soma estes eventos no mês e compara com o limite do plano.
 * Só no servidor.
 */
export async function recordUsage(organizationId: string, kind: MeteredKind, quantity = 1, metadata: Record<string, unknown> = {}) {
  if (quantity <= 0) return
  const { error } = await getSupabaseAdmin().from("usage_events").insert({ organization_id: organizationId, kind, quantity: Math.round(quantity), metadata })
  if (error) console.error("[usage]", kind, error.message)
}
