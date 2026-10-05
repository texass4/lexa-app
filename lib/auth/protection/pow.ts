import { sha256 } from "./sha256"

/**
 * Prova de trabalho do desafio anti-bot: achar um `nonce` tal que
 * SHA-256(`desafio:nonce`) comece com `bits` bits zero. Para uma pessoa, custa
 * menos de um segundo enquanto preenche o formulário; para quem quer criar milhares
 * de contas por script, cada tentativa passa a custar CPU — além do limite por IP.
 */

export function leadingZeroBits(bytes: Uint8Array) {
  let bits = 0
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8
      continue
    }
    return bits + Math.clz32(byte) - 24
  }
  return bits
}

export const meetsDifficulty = (challenge: string, nonce: string, bits: number) =>
  /^[0-9a-z]{1,16}$/.test(nonce) && leadingZeroBits(sha256(`${challenge}:${nonce}`)) >= bits

/** Procura o nonce em blocos, devolvendo a vez ao navegador entre um bloco e outro. */
export async function solveChallenge(challenge: string, bits: number, { chunk = 4000, signal }: { chunk?: number; signal?: AbortSignal } = {}) {
  for (let n = 0; ; n++) {
    const nonce = n.toString(36)
    if (meetsDifficulty(challenge, nonce, bits)) return nonce
    if (n % chunk === chunk - 1) {
      if (signal?.aborted) throw new DOMException("Cancelado", "AbortError")
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}
