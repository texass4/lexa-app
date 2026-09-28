import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { HttpError } from "@/lib/auth/server"

/** Plano existente e ativo (para atribuir a um escritório). */
export async function assertAssignablePlan(name: string, { allowInactive = false } = {}) {
  const { data } = await getSupabaseAdmin().from("plans").select("name, status").eq("name", name).maybeSingle<{ name: string; status: string }>()
  if (!data) throw new HttpError(400, "Plano inválido.")
  if (data.status !== "active" && !allowInactive) throw new HttpError(400, `O plano ${name} está desativado.`)
  return data.name
}

/** Plano para um escritório novo: o preferido se ativo; senão, o primeiro ativo do catálogo. */
export async function resolveDefaultPlan(preferred?: string) {
  const { data } = await getSupabaseAdmin().from("plans").select("name, status").order("sort_order").order("name")
  const active = ((data ?? []) as { name: string; status: string }[]).filter((p) => p.status === "active")
  return active.find((p) => p.name === preferred)?.name ?? active[0]?.name ?? preferred ?? "Essencial"
}
