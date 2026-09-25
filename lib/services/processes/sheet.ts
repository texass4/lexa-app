/**
 * "Ficha do processo": o modelo simples que sai da API e chega na tela.
 *
 * É o contorno da integração — a partir daqui ninguém mais vê `_source`,
 * `hits`, `movimentos` ou qualquer campo com nome de provider. Datas já saem no
 * formato ISO local usado pelo restante do LEXA.
 */

import { formatCNJ } from "@/lib/cnj"
import type { ExternalParty, ExternalProcess, ProviderName } from "@/lib/integrations/legal/types"
import type { MovementComplement, MovementDocument, MovementJudicialUnit } from "@/types"
import { externalMovementHash } from "./movements"

export interface SheetMovement {
  /** Identidade de conteúdo, usada para não importar a mesma coisa duas vezes. */
  hash: string
  code?: number
  name: string
  description?: string
  /** ISO local, ex.: `2026-09-23T07:58:00`. */
  occurredAt: string
  complements?: MovementComplement[]
  judicialUnit?: MovementJudicialUnit
  document?: MovementDocument
  /** Objeto original da fonte. */
  raw?: unknown
}

export interface SheetParties {
  active: ExternalParty[]
  passive: ExternalParty[]
  others: ExternalParty[]
}

export interface ProcessSheet {
  /** 20 dígitos. */
  cnj: string
  /** `0000832-35.2018.4.01.3202` */
  number: string
  tribunal?: string
  degree?: string
  className?: string
  subject?: string
  /** Termo neutro: a fonte não garante que seja uma vara. */
  judicialUnit?: string
  judicialUnitCode?: number
  system?: string
  format?: string
  /** `YYYY-MM-DD` */
  filedAt?: string
  /** ISO local da última atualização informada pela fonte. */
  updatedAt?: string
  /** Situação como a fonte descreve. Nunca é o status interno do escritório. */
  sourceStatus?: string
  secrecyLevel?: number
  parties: SheetParties
  lastMovement?: { name: string; occurredAt: string }
  movements: SheetMovement[]
  source: { provider: ProviderName; externalId?: string; dataset?: string }
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/

/**
 * Data da fonte → ISO local sem fuso, o formato de data do projeto.
 *
 * Lê os componentes literais do texto em vez de passar por `Date`, porque
 * converter fuso deslocaria o dia (um ajuizamento à meia-noite UTC viraria o
 * dia anterior no Brasil) e mudaria o horário registrado nos autos. Também
 * deixa o resultado independente do fuso do servidor.
 */
function toLocal(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = WALL_CLOCK.exec(value.trim())
  if (!match) return undefined
  const [, year, month, day, hours = "00", minutes = "00", seconds = "00"] = match
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

export function buildProcessSheet(external: ExternalProcess): ProcessSheet {
  const movements: SheetMovement[] = external.movements
    .map((movement): SheetMovement | null => {
      const occurredAt = toLocal(movement.occurredAt)
      if (!occurredAt) return null
      return {
        hash: externalMovementHash(external.cnj, movement),
        code: movement.code,
        name: movement.name,
        description: movement.description,
        occurredAt,
        complements: movement.complements,
        judicialUnit: movement.judicialUnit,
        document: movement.document,
        raw: movement.raw,
      }
    })
    .filter((movement): movement is SheetMovement => movement !== null)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  const [latest] = movements

  return {
    cnj: external.cnj,
    number: formatCNJ(external.cnj),
    tribunal: external.tribunal,
    degree: external.degree,
    className: external.className,
    subject: external.subject,
    judicialUnit: external.judicialUnit?.name,
    judicialUnitCode: external.judicialUnit?.code,
    system: external.system,
    format: external.format,
    filedAt: toLocal(external.filedAt)?.slice(0, 10),
    updatedAt: toLocal(external.updatedAt),
    sourceStatus: external.status,
    secrecyLevel: external.secrecyLevel,
    parties: external.parties ?? { active: [], passive: [], others: [] },
    lastMovement: latest ? { name: latest.name, occurredAt: latest.occurredAt } : undefined,
    movements,
    source: external.source,
  }
}
