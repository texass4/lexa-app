import { redirect } from "next/navigation"
import { createSupabaseServer } from "@/lib/supabase/server"
import { AdminShell } from "@/components/admin/shell/admin-shell"

/**
 * Íntegra Admin. A checagem de papel acontece no servidor, antes de renderizar qualquer
 * coisa; e cada dado vem de `/api/admin/*`, que confere de novo a cada requisição
 * (`requireAdmin`) — navegar entre páginas sem recarregar não pula a autorização.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin")
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, active, name, email")
    .eq("id", user.id)
    .maybeSingle<{ id: string; role: string; active: boolean; name: string; email: string }>()
  if (profile?.role !== "super_admin" || !profile.active) redirect("/")
  return <AdminShell admin={{ id: profile.id, name: profile.name, email: profile.email }}>{children}</AdminShell>
}
