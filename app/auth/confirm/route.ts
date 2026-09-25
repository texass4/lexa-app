import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServer } from "@/lib/supabase/server"
import { safeNext } from "@/lib/auth/validation"

const TYPES = new Set(["recovery", "invite"])

/**
 * Destino dos links de recuperação e convite: troca o token (uso único, com validade)
 * por uma sessão e leva para a tela de definir a senha.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const tokenHash = params.get("token_hash")
  const type = params.get("type")
  const next = safeNext(params.get("next"), "/redefinir-senha")

  if (tokenHash && type && TYPES.has(type)) {
    const supabase = await createSupabaseServer()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "recovery" | "invite" })
    if (!error) {
      const url = new URL(next, request.url)
      if (type === "invite") url.searchParams.set("convite", "1")
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.redirect(new URL("/login?erro=link", request.url))
}
