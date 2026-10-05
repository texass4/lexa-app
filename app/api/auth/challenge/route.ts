import { NextResponse, type NextRequest } from "next/server"
import { route } from "@/lib/auth/server"
import { issueChallenge, type ChallengePurpose } from "@/lib/auth/protection/challenge"
import { clientIp } from "@/lib/auth/protection/client-ip"
import { enforce, LIMITS } from "@/lib/auth/protection/rate-limit"

const PURPOSES: ChallengePurpose[] = ["signup", "recover", "resend"]

/** GET /api/auth/challenge?purpose=signup — desafio anti-bot para um formulário público. */
export const GET = route(async (request: NextRequest) => {
  const purpose = request.nextUrl.searchParams.get("purpose") as ChallengePurpose
  if (!PURPOSES.includes(purpose)) return NextResponse.json({ error: "Formulário inválido." }, { status: 400 })
  await enforce([LIMITS.challengeIp, clientIp(request)])
  return NextResponse.json(issueChallenge(purpose), { headers: { "Cache-Control": "no-store" } })
})
