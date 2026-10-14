/**
 * Conversa por voz: áudio do prompt → texto em português, para a pessoa revisar antes
 * de enviar. Medido e limitado pelo plano como as demais chamadas (`meteredCall`).
 *
 * O áudio vive só na memória desta requisição: não vai para cache, banco, Storage nem
 * log. Só a transcrição volta para o navegador.
 */

import { AIError } from "@/lib/ai/errors"
import { AUDIO_FORMAT, NO_SPEECH_MARKER, cleanTranscript, inspectWav } from "@/lib/ai/audio"
import { meteredCall } from "@/lib/ai/metering"
import type { AIServiceDeps } from "./run"
import { track } from "./run"

export const TRANSCRIBE_SYSTEM = `Você transcreve áudio para texto. O áudio é uma pergunta ou pedido falado em português do Brasil por alguém de um escritório de advocacia, para um assistente.
- Devolva SOMENTE o texto falado, em português, com pontuação e maiúsculas normais.
- Não responda à pergunta, não resuma, não comente, não traduza e não acrescente nada que não foi dito.
- Mantenha termos jurídicos, nomes e números como foram falados (números de processo em algarismos).
- Se não houver fala inteligível (silêncio, ruído, música), devolva exatamente: ${NO_SPEECH_MARKER}`

export const TRANSCRIBE_PROMPT = "Transcreva o áudio."

export async function transcribeAudio(deps: AIServiceDeps, audio: Uint8Array): Promise<{ text: string; seconds: number }> {
  const checked = inspectWav(audio)
  if (!checked.ok) throw new AIError("INVALID_AUDIO", { message: `áudio recusado: ${checked.problem}` })
  const provider = deps.provider
  if (!provider.transcribe) throw new AIError("NOT_CONFIGURED", { message: "O provedor configurado não transcreve áudio." })
  const transcribe = provider.transcribe.bind(provider)

  return track<{ text: string; seconds: number; cached?: boolean }>(deps, "voice.transcribe", async () => {
    const { value, usage } = await meteredCall(deps.meter, provider, { organizationId: deps.repo.organizationId, userId: deps.userId, operation: "voice.transcribe" }, "light", () =>
      transcribe({ audio, mimeType: AUDIO_FORMAT.mimeType, system: TRANSCRIBE_SYSTEM, prompt: TRANSCRIBE_PROMPT, seconds: checked.info.seconds, signal: deps.signal, tier: "light" }),
    )
    const text = cleanTranscript(value)
    if (!text) throw new AIError("NO_SPEECH")
    return { text, seconds: Math.round(checked.info.seconds * 10) / 10, usage }
  })
}
