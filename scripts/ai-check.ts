/**
 * Diagnóstico da Íntegra IA, só pelo terminal (nunca por rota pública):
 *
 *   npm run ai:check                      # texto e áudio em cada modelo configurado
 *   npm run ai:check -- --wav=pergunta.wav # e transcreve um WAV seu (16 kHz, mono, 16 bits)
 *
 * Lê o `.env.local`. Para cada modelo (principal, leve e reservas), uma pergunta curta em
 * texto e dois áudios de teste (tom de 2 s e de 20 s, sem fala), sem trocar de modelo:
 * mostra tempo, tokens e o erro do provedor. Nunca mostra a chave.
 */
import { readFileSync } from "node:fs"
import { encodeWav, inspectWav } from "../lib/ai/audio"
import { getAIConfig } from "../lib/ai/config"
import { isAIError } from "../lib/ai/errors"
import { GeminiProvider } from "../lib/ai/gemini"
import { TRANSCRIBE_PROMPT, TRANSCRIBE_SYSTEM } from "../lib/ai/services/transcribe"

const wavArg = process.argv.find((arg) => arg.startsWith("--wav="))?.slice("--wav=".length)

let config: ReturnType<typeof getAIConfig>
try {
  config = getAIConfig()
} catch (error) {
  console.error(`✗ Íntegra IA sem configuração: ${isAIError(error) ? error.message : String(error)}. Confira GEMINI_API_KEY e AI_* no .env.local.`)
  process.exit(1)
}

const models = [...new Set([config.model, config.lightModel, ...config.fallbackModels])]
console.info(`Modelos: principal ${config.model} · leve ${config.lightModel}${config.fallbackModels.length ? ` · reservas ${config.fallbackModels.join(", ")}` : ""}`)
console.info(`Tempo máximo: ${config.timeoutMs / 1000}s (transcrição: até 30s)\n`)

/** Tom de 440 Hz: exercita o caminho do áudio sem precisar de fala. */
function testTone(seconds: number) {
  const samples = new Float32Array(seconds * 16_000)
  for (let i = 0; i < samples.length; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16_000)
  return new Uint8Array(encodeWav(samples))
}

// 2 s ≈ 64 KB; 20 s ≈ 640 KB — se só o grande trava, o gargalo é o envio (rede/antivírus/proxy).
const tones = [2, 20].map((seconds) => ({ seconds, audio: testTone(seconds) }))
let own: { audio: Uint8Array; seconds: number } | undefined
if (wavArg) {
  const audio = new Uint8Array(readFileSync(wavArg))
  const checked = inspectWav(audio)
  if (!checked.ok) {
    console.error(`✗ ${wavArg}: ${checked.problem} (precisa ser WAV PCM 16 bits, mono, 16 kHz, de 0,5 a 60 s)`)
    process.exit(1)
  }
  own = { audio, seconds: checked.info.seconds }
}

const describe = (error: unknown) => {
  if (!isAIError(error)) return String(error)
  const status = error.providerStatus ? ` (HTTP ${error.providerStatus})` : ""
  const tries = error.attempts?.map((a) => `${a.status ?? a.code} em ${(a.ms / 1000).toFixed(1)}s`).join(", depois ")
  return `${error.code}${status}${tries ? ` — tentativas: ${tries}` : ""}`
}

async function measure(label: string, run: () => Promise<{ value: string; usage?: { inputTokens?: number; outputTokens?: number } }>) {
  const began = Date.now()
  try {
    const { value, usage } = await run()
    const seconds = ((Date.now() - began) / 1000).toFixed(1)
    console.info(`  ✓ ${label.padEnd(10)} ${seconds}s · ${usage?.inputTokens ?? "?"}→${usage?.outputTokens ?? "?"} tokens · "${value.replace(/\s+/g, " ").slice(0, 70)}"`)
  } catch (error) {
    console.info(`  ✗ ${label.padEnd(10)} ${((Date.now() - began) / 1000).toFixed(1)}s · ${describe(error)}`)
  }
}

for (const model of models) {
  console.info(model)
  // Um modelo só (sem trocar por outro): em 503/429 ele é repetido uma vez, como no app.
  const provider = new GeminiProvider({ apiKey: config.apiKey, model, lightModel: model, timeoutMs: config.timeoutMs, retryDelayMs: 1500 })
  await measure("texto", () => provider.generateText({ system: "Responda em uma palavra.", messages: [{ role: "user", content: "Diga: ok" }], maxOutputTokens: 256 }))
  for (const { seconds, audio } of tones) {
    await measure(`áudio ${seconds}s`, () => provider.transcribe({ audio, mimeType: "audio/wav", system: TRANSCRIBE_SYSTEM, prompt: TRANSCRIBE_PROMPT, seconds, tier: "light" }))
  }
  if (own) {
    const { audio, seconds } = own
    await measure("seu WAV", () => provider.transcribe({ audio, mimeType: "audio/wav", system: TRANSCRIBE_SYSTEM, prompt: TRANSCRIBE_PROMPT, seconds, tier: "light" }))
  }
  console.info("")
}
