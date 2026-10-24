import { NextResponse, type NextRequest } from "next/server"
import { authConfig, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session"

/** Telas abertas sem sessão. Todo o resto exige a sessão da pessoa dona da Mesa. */
const PUBLIC = ["/login"]

/**
 * Primeira barreira: sem sessão válida, páginas vão para o login e APIs respondem 401.
 * Páginas, Server Actions e rotas conferem a sessão de novo no servidor (lib/auth/server.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const config = authConfig()
  const valid = config.ok && (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, config.secret))

  if (!valid && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  if (valid && isPublic) return NextResponse.redirect(new URL("/", request.url))

  const response = NextResponse.next()
  // Dados pessoais: nunca em cache compartilhado nem em buscadores.
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("X-Robots-Tag", "noindex, nofollow")
  return response
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
}
