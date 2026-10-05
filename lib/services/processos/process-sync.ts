/**
 * Aplicar uma ficha reconsultada a um processo salvo — a regra única, usada pelo
 * navegador (botão "Atualizar", abertura do processo) e pelo servidor
 * (monitoramento automático, `monitor.ts`).
 *
 * - Só entram movimentações novas: a identidade é o hash do conteúdo
 *   (`movements.ts`), então aplicar a mesma ficha duas vezes não duplica nada.
 * - A fonte complementa o cadastro, mas nunca apaga o que já foi preenchido.
 * - `lastSyncedAt` nunca volta no tempo (uma ficha do cache pode ser anterior).
 *
 * Lógica pura: sem React, sem banco.
 */

import type { Process, ProcessMovement } from "@/types"
import { toProcessMovements } from "./import"
import { collectHashes, diffMovements } from "./movements"
import type { ProcessSheet } from "./sheet"

export interface MergeOptions {
  /** Gera o id de cada movimentação importada. */
  newId: () => string
  /** A sincronização foi feita pelo monitoramento automático (grava `autoSyncedAt`). */
  automatic?: boolean
}

export interface MergeResult {
  process: Process
  /** Movimentações que ainda não existiam no processo, já com id. */
  imported: ProcessMovement[]
}

const latest = (current: string | undefined, next: string) => (current && current > next ? current : next)

/**
 * `checkedAt`: ISO local de quando a fonte foi conferida (pode vir do cache do
 * escritório — é a data real da informação, não a hora em que foi aplicada).
 */
export function mergeProcessSheet(current: Process, sheet: ProcessSheet, checkedAt: string, options: MergeOptions): MergeResult {
  const cnj = current.cnj ?? sheet.cnj
  const incoming = toProcessMovements(sheet.movements, sheet.source.provider)
  const { fresh } = diffMovements(collectHashes(cnj, current.movements), incoming)

  const imported: ProcessMovement[] = fresh.map((movement) => ({ ...movement, id: options.newId() }))
  const movements = imported.length ? [...imported, ...current.movements].sort((a, b) => b.at.localeCompare(a.at)) : current.movements

  const process: Process = {
    ...current,
    movements,
    lastMovementAt: movements[0]?.at ?? current.lastMovementAt,
    lastSyncedAt: latest(current.lastSyncedAt, checkedAt),
    ...(options.automatic ? { autoSyncedAt: latest(current.autoSyncedAt, checkedAt) } : {}),
    cnj,
    tribunal: sheet.tribunal ?? current.tribunal,
    degree: sheet.degree ?? current.degree,
    className: sheet.className ?? current.className,
    subject: sheet.subject ?? current.subject,
    judicialUnit: sheet.judicialUnit ?? current.judicialUnit,
    system: sheet.system ?? current.system,
    parties: sheet.parties.active.length || sheet.parties.passive.length || sheet.parties.others.length ? sheet.parties : current.parties,
    source: {
      provider: sheet.source.provider,
      externalId: sheet.source.externalId,
      dataset: sheet.source.dataset,
      sourceStatus: sheet.sourceStatus,
    },
  }

  return { process, imported }
}

/** Frase da atividade registrada quando há novidade: "3 novas movimentações no processo #103000." */
export function newMovementsMessage(count: number, code: string) {
  return `${count === 1 ? "Nova movimentação" : `${count} novas movimentações`} no processo ${code}.`
}
