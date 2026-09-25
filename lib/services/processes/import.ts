/**
 * Conversão da ficha externa para o modelo interno do LEXA.
 *
 * Fica separado do store porque é lógica pura: dá para testar sem React e
 * reaproveitar quando a persistência sair do browser.
 */

import type { PracticeArea, ProcessMovement, ProcessStatus, Process } from "@/types"
import type { ProcessSheet, SheetMovement } from "./sheet"

/**
 * Movimentações da ficha no formato interno, ainda sem `id`.
 *
 * Guarda os fatos da fonte (código, nome, complementos, órgão, objeto
 * original) sem classificá-los: categoria, título e descrição de tela são
 * papel do `movement-interpreter`, que pode evoluir sem nova consulta.
 */
export function toProcessMovements(movements: SheetMovement[], origin: ProcessMovement["origin"]): Omit<ProcessMovement, "id">[] {
  return movements.map((movement) => ({
    at: movement.occurredAt,
    title: movement.name,
    description: movement.description,
    code: movement.code,
    hash: movement.hash,
    origin,
    complements: movement.complements,
    judicialUnit: movement.judicialUnit,
    document: movement.document,
    raw: movement.raw,
  }))
}

export interface ImportProcessMeta {
  clientId: string
  ownerId: string
  area: PracticeArea
  status?: ProcessStatus
  claimValue?: number
  district?: string
  opposingParty?: string
  /** Ajustes feitos pelo usuário sobre o que a fonte trouxe. */
  type?: string
  court?: string
}

/**
 * Campos do processo derivados da ficha. O store completa `id`, `code`,
 * `organizationId` e `createdAt`.
 */
export type ProcessDraft = Omit<Process, "id" | "code" | "organizationId" | "createdAt" | "movements"> & {
  movements: Omit<ProcessMovement, "id">[]
}

export function buildProcessDraft(sheet: ProcessSheet, meta: ImportProcessMeta, syncedAt: string): ProcessDraft {
  const movements = toProcessMovements(sheet.movements, sheet.source.provider)
  const firstPassive = sheet.parties.passive[0]?.name

  return {
    number: sheet.number,
    cnj: sheet.cnj,
    clientId: meta.clientId,
    ownerId: meta.ownerId,
    area: meta.area,
    // `type` é o rótulo curto que a lista de processos já exibe.
    type: meta.type || sheet.className || sheet.subject || "Processo importado",
    court: meta.court || sheet.judicialUnit || "Não informado pela fonte",
    district: meta.district ?? sheet.tribunal ?? "Não informado pela fonte",
    opposingParty: meta.opposingParty ?? firstPassive ?? "Não informado pela fonte",
    status: meta.status ?? "em_andamento",
    claimValue: meta.claimValue ?? 0,
    distributedAt: sheet.filedAt ?? movements[movements.length - 1]?.at.slice(0, 10) ?? syncedAt.slice(0, 10),
    lastMovementAt: movements[0]?.at ?? syncedAt,
    tribunal: sheet.tribunal,
    degree: sheet.degree,
    className: sheet.className,
    subject: sheet.subject,
    judicialUnit: sheet.judicialUnit,
    system: sheet.system,
    parties: sheet.parties,
    source: {
      provider: sheet.source.provider,
      externalId: sheet.source.externalId,
      dataset: sheet.source.dataset,
      sourceStatus: sheet.sourceStatus,
    },
    lastSyncedAt: syncedAt,
    movements,
  }
}
