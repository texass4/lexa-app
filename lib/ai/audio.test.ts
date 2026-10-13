import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { AUDIO_LIMITS, cleanTranscript, encodeWav, hasSound, inspectWav } from "./audio"

/** Tom de 440 Hz (som real gerado aqui, só para testar o formato). */
const tone = (seconds: number, rate = 16_000, amplitude = 0.3) => {
  const samples = new Float32Array(Math.round(seconds * rate))
  for (let i = 0; i < samples.length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / rate)
  return samples
}

/** WAV com cabeçalho editável (formatos que o servidor deve recusar). */
function wavWith(patch: { channels?: number; rate?: number; bits?: number; format?: number }, seconds = 1) {
  const bytes = new Uint8Array(encodeWav(tone(seconds)))
  const view = new DataView(bytes.buffer)
  if (patch.format !== undefined) view.setUint16(20, patch.format, true)
  if (patch.channels !== undefined) view.setUint16(22, patch.channels, true)
  if (patch.rate !== undefined) view.setUint32(24, patch.rate, true)
  if (patch.bits !== undefined) view.setUint16(34, patch.bits, true)
  return bytes
}

describe("áudio da conversa por voz", () => {
  it("WAV gerado no navegador passa na conferência do servidor", () => {
    const bytes = new Uint8Array(encodeWav(tone(2)))
    assert.equal(bytes.byteLength, 44 + 2 * 16_000 * 2)
    const result = inspectWav(bytes)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.info.sampleRate, 16_000)
      assert.equal(result.info.channels, 1)
      assert.equal(result.info.bitsPerSample, 16)
      assert.equal(result.info.seconds, 2)
    }
  })

  it("recusa o que não é WAV PCM 16 kHz mono, curto, longo ou grande demais", () => {
    assert.deepEqual(inspectWav(new TextEncoder().encode("não é áudio, só texto qualquer com mais de 44 bytes...")), { ok: false, problem: "not_wav" })
    assert.deepEqual(inspectWav(wavWith({ channels: 2 })), { ok: false, problem: "unsupported_format" })
    assert.deepEqual(inspectWav(wavWith({ rate: 44_100 })), { ok: false, problem: "unsupported_format" })
    assert.deepEqual(inspectWav(wavWith({ bits: 8 })), { ok: false, problem: "unsupported_format" })
    assert.deepEqual(inspectWav(wavWith({ format: 3 })), { ok: false, problem: "unsupported_format" })
    assert.deepEqual(inspectWav(new Uint8Array(encodeWav(tone(0.2)))), { ok: false, problem: "too_short" })
    assert.deepEqual(inspectWav(new Uint8Array(AUDIO_LIMITS.maxBytes + 1)), { ok: false, problem: "too_large" })
    // Cabeçalho mentindo a duração: o tamanho real do bloco é que vale.
    const long = new Uint8Array(encodeWav(tone(62)))
    assert.deepEqual(inspectWav(long), { ok: false, problem: "too_large" })
  })

  it("silêncio não é enviado; som é", () => {
    assert.equal(hasSound(new Float32Array(16_000)), false)
    assert.equal(hasSound(tone(1, 16_000, 0.002)), false)
    assert.equal(hasSound(tone(1)), true)
  })

  it("limpa a transcrição e reconhece 'sem fala'", () => {
    assert.equal(cleanTranscript('  "Quais prazos vencem esta semana?" '), "Quais prazos vencem esta semana?")
    assert.equal(cleanTranscript("Transcrição: Resuma o processo."), "Resuma o processo.")
    assert.equal(cleanTranscript("[sem fala]"), undefined)
    assert.equal(cleanTranscript("   "), undefined)
  })
})
