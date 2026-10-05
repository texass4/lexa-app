import { HttpError } from "@/lib/auth/http-error"
import { allow, LIMITS } from "./rate-limit"
import { checkChallenge, type ChallengePurpose } from "./challenge"

const INVALID_FORM = "Não foi possível validar o formulário. Recarregue a página e tente de novo."

/** Corpo dos formulários públicos protegidos. `website` é o campo-isca (pessoas não veem). */
export interface ProtectedBody {
  challenge?: unknown
  solution?: unknown
  website?: unknown
}

/** Campo-isca preenchido: é robô. Quem chama finge sucesso e não faz nada. */
export const isHoneypot = (body: ProtectedBody) => typeof body.website === "string" && body.website.trim().length > 0

/** Confere o desafio anti-bot e o marca como usado (cada um vale para um envio). */
export async function requireChallenge(body: ProtectedBody, purpose: ChallengePurpose) {
  const check = checkChallenge(body.challenge, body.solution, purpose)
  if (!check.ok) throw new HttpError(400, INVALID_FORM)
  if (!(await allow(LIMITS.challengeUse, `${purpose}:${check.id}`))) throw new HttpError(400, INVALID_FORM)
}
