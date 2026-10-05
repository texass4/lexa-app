import { NextResponse } from "next/server"
import { HttpError, readJson, route } from "@/lib/auth/server"
import { isEmail, normalizeEmail, passwordProblem } from "@/lib/auth/validation"
import { loadSettings } from "@/lib/admin/platform"
import { requestSignup } from "@/lib/auth/signup"
import { clientIp } from "@/lib/auth/protection/client-ip"
import { enforce, LIMITS } from "@/lib/auth/protection/rate-limit"
import { isHoneypot, requireChallenge, type ProtectedBody } from "@/lib/auth/protection/guard"
import { atLeast } from "@/lib/auth/protection/timing"

interface Body extends ProtectedBody {
  name?: string
  email?: string
  password?: string
  officeName?: string
  cnpj?: string
}

/** Todas as respostas levam pelo menos isso: o tempo não denuncia o que aconteceu. */
const MIN_RESPONSE_MS = 1_200

/** A mesma resposta para e-mail novo, e-mail com conta e robô (campo-isca). */
const accepted = () => NextResponse.json({ ok: true }, { status: 202 })

/**
 * Cadastro público. Protegido, nesta ordem: limite por IP e teto geral, campo-isca,
 * desafio anti-bot (assinado, com prova de trabalho e uso único), limite por e-mail.
 * Nada do escritório é criado aqui: só depois da confirmação do e-mail
 * (`lib/auth/signup.ts`). A resposta não revela se o e-mail já tem conta.
 */
export const POST = route((request) =>
  atLeast(MIN_RESPONSE_MS, async () => {
    const body = await readJson<Body>(request)
    const ip = clientIp(request)
    await enforce([LIMITS.signupIp, ip], [LIMITS.signupIpDay, ip], [LIMITS.signupGlobal, "all"])
    if (isHoneypot(body)) return accepted()
    await requireChallenge(body, "signup")

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const email = normalizeEmail(typeof body.email === "string" ? body.email : "")
    const password = typeof body.password === "string" ? body.password : ""
    const officeName = typeof body.officeName === "string" ? body.officeName.trim() : ""
    const cnpj = typeof body.cnpj === "string" ? body.cnpj.trim().slice(0, 32) : undefined

    if (name.length < 3 || name.length > 120) throw new HttpError(400, "Informe seu nome completo.")
    if (!isEmail(email)) throw new HttpError(400, "E-mail inválido.")
    const weak = passwordProblem(password)
    if (weak) throw new HttpError(400, weak)
    if (officeName.length < 2 || officeName.length > 160) throw new HttpError(400, "Informe o nome do escritório.")

    await enforce([LIMITS.signupEmail, email])
    const settings = await loadSettings()
    if (!settings.general.publicSignup) throw new HttpError(403, "O cadastro de novos escritórios está fechado no momento. Fale com a equipe da Íntegra.")

    await requestSignup(request, { name, email, password, officeName, cnpj })
    return accepted()
  }),
)
