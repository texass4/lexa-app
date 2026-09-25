import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

/** Cliente do servidor com a sessão de quem fez a requisição (sujeito à RLS). */
export async function createSupabaseServer() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Chamado de um Server Component: o proxy já renova a sessão.
        }
      },
    },
  })
}
