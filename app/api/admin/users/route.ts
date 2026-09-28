import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { route } from "@/lib/auth/server"
import { requireAdmin } from "@/lib/admin/guard"
import { loadUsers } from "@/lib/admin/data"

/** Todos os usuários de todos os escritórios, com último acesso; e a lista de escritórios (para filtros e mover). */
export const GET = route(async (request) => {
  await requireAdmin(request)
  const [users, { data: organizations }] = await Promise.all([
    loadUsers(),
    getSupabaseAdmin().from("organizations").select("id, name, status").order("name"),
  ])
  return NextResponse.json({ users, organizations: organizations ?? [] })
})
