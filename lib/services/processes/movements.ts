/**
 * Identidade e deduplicação de movimentações.
 *
 * A fonte devolve o histórico inteiro a cada consulta. Para não duplicar nada,
 * cada movimentação ganha um hash determinístico do seu conteúdo: sincronizar
 * duas vezes seguidas importa zero itens novos.
 *
 * O hash roda no servidor e no browser, então usa FNV-1a (sem `node:crypto`).
 * Não é criptográfico — serve para identidade de conteúdo, não para segurança.
 */

import type { ExternalMovement } from "@/lib/integrations/legal/types"

// Normaliza para que acento, espaçamento e caixa não gerem hashes diferentes.
import { fold as normalize } from "@/lib/format"

function fnv1a(input: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

export interface MovementIdentity {
  /** 20 dígitos do processo. */
  cnj: string
  code?: number
  name: string
  occurredAt: string
  description?: string
}

/**
 * Hash determinístico de uma movimentação.
 *
 * Considera processo + código + data + nome + descrição. Duas chamadas com o
 * mesmo conteúdo sempre produzem a mesma saída, em qualquer runtime.
 */
export function movementHash(input: MovementIdentity) {
  const key = [
    input.cnj.replace(/\D/g, ""),
    input.code ?? "",
    // Minuto é granularidade suficiente e evita ruído de fuso/segundos.
    input.occurredAt.slice(0, 16),
    normalize(input.name),
    normalize(input.description ?? ""),
  ].join("|")
  // Dois blocos FNV reduzem colisão sem trazer dependência de cripto.
  return `${fnv1a(key)}${fnv1a(`${key}|lexa`)}`
}

export const externalMovementHash = (cnj: string, movement: ExternalMovement) =>
  movementHash({
    cnj,
    code: movement.code,
    name: movement.name,
    occurredAt: movement.occurredAt,
    description: movement.description,
  })

export interface HashedMovement {
  hash?: string
}

/** Movimentação já armazenada, no formato interno. */
interface StoredMovement extends HashedMovement {
  at: string
  title: string
  description?: string
  code?: number
}

/**
 * Hashes das movimentações que o escritório já conhece.
 *
 * Registros anteriores à integração (seeds da demo, cadastro manual) não têm
 * `hash` gravado — para esses, o hash é calculado a partir do conteúdo. Sem
 * isso, a primeira sincronização importaria o histórico inteiro de novo.
 */
export function collectHashes(cnj: string, movements: StoredMovement[]): Set<string> {
  return new Set(
    movements.map(
      (movement) =>
        movement.hash ?? movementHash({ cnj, code: movement.code, name: movement.title, occurredAt: movement.at, description: movement.description }),
    ),
  )
}

/**
 * Separa o que é novo do que já existe, comparando hashes.
 *
 * Também protege contra repetição dentro da própria resposta da fonte.
 */
export function diffMovements<U extends HashedMovement>(existingHashes: Iterable<string>, incoming: U[]): { fresh: U[]; known: U[] } {
  const seen = new Set(existingHashes)
  const fresh: U[] = []
  const known: U[] = []

  for (const item of incoming) {
    if (item.hash && seen.has(item.hash)) {
      known.push(item)
      continue
    }
    if (item.hash) seen.add(item.hash)
    fresh.push(item)
  }

  return { fresh, known }
}
