/**
 * Áudio da Conversa por voz — lógica pura (navegador e servidor).
 *
 * Formato único: WAV PCM 16 bits, mono, 16 kHz. É um dos formatos de áudio que a API
 * do Gemini aceita em `generateContent` (WAV, MP3, AIFF, AAC, OGG, FLAC); o que o
 * navegador grava (WebM/Opus no Chrome e Firefox, MP4/AAC no Safari) é convertido no
 * próprio navegador antes do envio. 16 kHz mono é o suficiente para fala e deixa o
 * arquivo pequeno (32 KB por segundo).
 */

export const AUDIO_FORMAT = { mimeType: "audio/wav", sampleRate: 16_000, channels: 1, bitsPerSample: 16 } as const

export const AUDIO_LIMITS = {
  /** Gravação mais longa aceita (a gravação para sozinha aqui). */
  maxSeconds: 60,
  /** Abaixo disso não há pergunta para transcrever. */
  minSeconds: 0.5,
  /** Cabeçalho + 60 s de PCM 16 kHz mono 16 bits, com folga. */
  maxBytes: 44 + 60 * 16_000 * 2 + 1024,
} as const

/** Amostras (−1…1, mono) → arquivo WAV PCM 16 bits. */
export function encodeWav(samples: Float32Array, sampleRate: number = AUDIO_FORMAT.sampleRate): ArrayBuffer {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true) // tamanho do bloco fmt
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true) // bytes por segundo
  view.setUint16(32, bytesPerSample, true) // alinhamento do bloco
  view.setUint16(34, 16, true) // bits por amostra
  ascii(36, "data")
  view.setUint32(40, dataSize, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * bytesPerSample, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** Bytes de áudio (bloco `data`). */
  dataBytes: number
  dataOffset: number
  seconds: number
}

export type WavProblem = "not_wav" | "unsupported_format" | "too_short" | "too_long" | "too_large"

/**
 * Lê e confere um WAV recebido: PCM 16 bits mono 16 kHz, duração e tamanho dentro dos
 * limites. Lê os blocos de verdade (não confia em extensão nem em Content-Type).
 */
export function inspectWav(bytes: Uint8Array): { ok: true; info: WavInfo } | { ok: false; problem: WavProblem } {
  if (bytes.byteLength > AUDIO_LIMITS.maxBytes) return { ok: false, problem: "too_large" }
  if (bytes.byteLength < 44) return { ok: false, problem: "not_wav" }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return { ok: false, problem: "not_wav" }

  let fmt: { format: number; channels: number; sampleRate: number; bitsPerSample: number } | undefined
  let data: { offset: number; size: number } | undefined
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.byteLength) {
      fmt = { format: view.getUint16(body, true), channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bitsPerSample: view.getUint16(body + 14, true) }
    } else if (id === "data") {
      data = { offset: body, size: Math.min(size, bytes.byteLength - body) }
      break
    }
    offset = body + size + (size % 2)
  }
  if (!fmt || !data) return { ok: false, problem: "not_wav" }
  if (fmt.format !== 1 || fmt.channels !== AUDIO_FORMAT.channels || fmt.sampleRate !== AUDIO_FORMAT.sampleRate || fmt.bitsPerSample !== AUDIO_FORMAT.bitsPerSample) {
    return { ok: false, problem: "unsupported_format" }
  }
  const seconds = data.size / (fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8))
  if (seconds < AUDIO_LIMITS.minSeconds) return { ok: false, problem: "too_short" }
  if (seconds > AUDIO_LIMITS.maxSeconds + 1) return { ok: false, problem: "too_long" }
  return { ok: true, info: { ...fmt, dataBytes: data.size, dataOffset: data.offset, seconds } }
}

/**
 * Há fala (ou ao menos som) na gravação? Volume médio (RMS) em janelas de 50 ms: se
 * nenhuma janela passa do limiar, é silêncio — nem vale enviar para transcrever.
 */
export function hasSound(samples: Float32Array, sampleRate: number = AUDIO_FORMAT.sampleRate, threshold = 0.01): boolean {
  const window = Math.max(1, Math.round(sampleRate * 0.05))
  for (let start = 0; start < samples.length; start += window) {
    let sum = 0
    const end = Math.min(samples.length, start + window)
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    if (Math.sqrt(sum / (end - start)) >= threshold) return true
  }
  return false
}

/** Resposta do modelo quando não há fala inteligível (instruído na transcrição). */
export const NO_SPEECH_MARKER = "[sem fala]"

/** Limpa a transcrição devolvida pelo modelo (aspas, rótulos, espaços). `undefined` = sem fala. */
export function cleanTranscript(text: string): string | undefined {
  const cleaned = text
    .trim()
    .replace(/^(transcri[cç][aã]o|texto)\s*:\s*/i, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
  if (!cleaned || cleaned.toLowerCase().includes(NO_SPEECH_MARKER)) return undefined
  return cleaned
}
