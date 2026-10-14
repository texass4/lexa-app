/**
 * POST /api/ai/transcribe — áudio (WAV PCM 16 kHz mono, até 60 s) → { text }.
 * Conversa por voz da Íntegra: o texto volta para o campo da mensagem, para revisão;
 * nada é enviado ao chat daqui. O áudio não é guardado.
 */

import { AIError } from "@/lib/ai/errors"
import { AUDIO_FORMAT, AUDIO_LIMITS } from "@/lib/ai/audio"
import { aiRoute } from "@/lib/ai/http"
import { transcribeAudio } from "@/lib/ai/services/transcribe"
import { allow } from "@/lib/auth/protection/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Por pessoa: segura loops e abuso (o plano do escritório também limita). */
const VOICE_RULE = { id: "voice:user", limit: 30, windowSeconds: 600 }

export const POST = aiRoute(
  null,
  async ({ request, deps }) => {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== AUDIO_FORMAT.mimeType) throw new AIError("INVALID_AUDIO")
    const declared = Number(request.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > AUDIO_LIMITS.maxBytes) throw new AIError("INVALID_AUDIO", { message: "áudio grande demais" })
    if (!(await allow(VOICE_RULE, deps.userId))) throw new AIError("RATE_LIMITED", { retryAfter: 60 })
    const audio = new Uint8Array(await request.arrayBuffer())
    return transcribeAudio(deps, audio)
  },
  { body: "raw" },
)
