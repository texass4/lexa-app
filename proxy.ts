import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

/** Rotas acessíveis sem login. */
const PUBLIC = ["/login", "/cadastro", "/recuperar-senha", "/auth/confirm", "/api/auth/"]
/** Telas de entrada: quem já está logado é mandado para o app. */
const GUEST_ONLY = ["/login", "/cadastro", "/recuperar-senha"]

const matchesAny = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`))

/**
 * Renova a sessão do Supabase a cada requisição e barra quem não está logado.
 * Autorização fina (papel, permissão, escritório ativo) fica na RLS e nas rotas.
 */
export async function proxy(request: NextRequest) {
  // Sem Supabase configurado, nada além das telas públicas abre (falha fechada).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (matchesAny(request.nextUrl.pathname, PUBLIC)) return NextResponse.next()
    return new NextResponse("LEXA: configure o Supabase no .env.local (veja .env.example).", { status: 503 })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getUser valida o token no Supabase (getSession só leria o cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // O Supabase pode ter renovado a sessão acima: o redirecionamento leva os cookies novos.
  const redirect = (path: string, search = "") => {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.search = search
    const res = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => res.cookies.set(cookie))
    return res
  }

  if (!user && !matchesAny(pathname, PUBLIC)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
    return redirect("/login", pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`)
  }

  if (user && matchesAny(pathname, GUEST_ONLY)) return redirect("/")

  return response
}

export const config = {
  // Tudo menos os internos do Next (estáticos, imagens, HMR) e arquivos públicos.
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
