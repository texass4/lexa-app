import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServer } from "@/lib/supabase/server"
import { safeNext } from "@/lib/auth/validation"

/**
 * Para onde cada tipo de link leva por padrão. `recovery` e `invite` vêm dos e-mails da
 * Íntegra e dos templates do Supabase; `email` (confirmação de e-mail) só dos
 * templates do Supabase (`supabase/templates/confirmation.html`).
 */
const DEFAULT_NEXT = { recovery: "/redefinir-senha", invite: "/redefinir-senha", email: "/" } as const
type LinkType = keyof typeof DEFAULT_NEXT

const isLinkType = (type: string | null): type is LinkType => !!type && Object.hasOwn(DEFAULT_NEXT, type)

/**
 * Destino dos links de recuperação, convite e confirmação: troca o token (uso único,
 * com validade) por uma sessão e leva para a tela certa.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const tokenHash = params.get("token_hash")
  const type = params.get("type")

  if (tokenHash && isLinkType(type)) {
    const next = safeNext(params.get("next"), DEFAULT_NEXT[type])
    const supabase = await createSupabaseServer()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      const url = new URL(next, request.url)
      if (type === "invite") url.searchParams.set("convite", "1")
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.redirect(new URL("/login?erro=link", request.url))
}
