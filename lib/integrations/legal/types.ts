/**
 * Modelo externo normalizado — a fronteira entre o LEXA e qualquer fonte de
 * dados processuais (DataJud hoje; Codilo, Judit ou Escavador amanhã).
 *
 * Regra: nada fora de `lib/integrations/legal/<provider>/` conhece o formato
 * bruto do provider. Todo campo é opcional quando a fonte pode não fornecê-lo —
 * o DataJud público, por exemplo, não devolve as partes do processo.
 */

import type { MovementComplement, MovementDocument, MovementJudicialUnit } from "@/types"

/** Fontes de dados processuais suportadas. Novas fontes entram aqui. */
export type ProviderName = "datajud"

export interface ExternalParty {
  name: string
  document?: string
  type?: "individual" | "company"
  /** Papel como descrito pela fonte (ex.: "Requerente"). Não inferir. */
  role?: string
}

export interface ExternalMovement {
  /** Identificador da movimentação na fonte, quando existir. */
  externalId?: string
  /** Código da tabela processual unificada do CNJ. */
  code?: number
  /** Nome do movimento exatamente como a fonte informou. */
  name: string
  /** Texto legível dos complementos (ex.: "Certidão"). Nunca o identificador técnico. */
  description?: string
  /** ISO 8601. */
  occurredAt: string
  complements?: MovementComplement[]
  judicialUnit?: MovementJudicialUnit
  /** Só quando a fonte fornece acesso real ao arquivo. */
  document?: MovementDocument
  /** Objeto original da fonte, sem alteração. */
  raw?: unknown
}

export interface ExternalProcess {
  /** 20 dígitos, sem pontuação. */
  cnj: string

  /** Sigla do tribunal conforme a fonte (ex.: "TRF1"). */
  tribunal?: string
  /** Grau conforme a fonte (ex.: "G1", "JE"). Não traduzir aqui. */
  degree?: string

  className?: string
  subject?: string

  system?: string
  /** Eletrônico / físico, quando informado. */
  format?: string

  filedAt?: string
  updatedAt?: string

  /**
   * Órgão julgador. Termo neutro de propósito: a fonte não garante que seja
   * uma vara.
   */
  judicialUnit?: {
    code?: number
    name?: string
    municipalityCode?: number
  }

  parties?: {
    active: ExternalParty[]
    passive: ExternalParty[]
    others: ExternalParty[]
  }

  /** Situação como descrita pela fonte. Nunca usada como status interno. */
  status?: string

  /** Nível de sigilo informado pela fonte, quando houver. */
  secrecyLevel?: number

  movements: ExternalMovement[]

  source: {
    provider: ProviderName
    externalId?: string
    /** Índice/endpoint consultado, útil em log e suporte. */
    dataset?: string
  }
}
