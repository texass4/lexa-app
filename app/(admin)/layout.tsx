import { redirect } from "next/navigation"
import { createSupabaseServer } from "@/lib/supabase/server"

/** Painel do Super Admin: a checagem de papel acontece no servidor, antes de renderizar. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", user.id).maybeSingle<{ role: string; active: boolean }>()
  if (profile?.role !== "super_admin" || !profile.active) redirect("/")
  return children
}
