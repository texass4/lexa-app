import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let admin: SupabaseClient | undefined

/**
 * Cliente com a service role: ignora a RLS. Só para rotas do servidor, depois de
 * checar quem está chamando (`lib/auth/server.ts`). Nunca importe em componente.
 */
export function getSupabaseAdmin() {
  if (typeof window !== "undefined") throw new Error("getSupabaseAdmin só pode rodar no servidor.")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no .env.local.")
  admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return admin
}
