import { getSupabase } from "@/lib/supabase/client"
import { hardNavigate } from "./navigate"

/** Sai da conta: registra a saída na auditoria (enquanto a sessão ainda vale) e volta ao login. */
export async function signOutAndLeave(path = "/login") {
  await fetch("/api/auth/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "logout" }) }).catch(
    () => undefined,
  )
  await getSupabase().auth.signOut()
  hardNavigate(path)
}
