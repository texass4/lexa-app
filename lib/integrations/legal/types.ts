/**
 * Modelo externo normalizado — a fronteira entre a Íntegra e qualquer fonte de
 * dados processuais (DataJud hoje; Codilo, Judit ou Escavador amanhã).
 *
 * Trocar de fornecedor = escrever outro `ProcessProvider`. O serviço de
 * consulta (`lib/services/processos/lookup-service.ts`), o cache e a interface
 * não mudam.
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

/**
 * Resumo de um registro do processo na fonte (no DataJud, um documento por grau ou
 * instância). Serve de evidência para identificar o tribunal atual — sozinho, o mais
 * recente não prova onde o processo tramita.
 */
export interface ExternalRecord {
  /** Sigla do tribunal como o registro informa (ausente se a fonte não informou). */
  tribunal?: string
  /** Grau como a fonte informa (ex.: "G1", "G2", "JE"). */
  degree?: string
  judicialUnit?: string
  /** ISO da última atualização do registro na fonte. */
  updatedAt?: string
  /** Índice em que o registro foi encontrado. */
  dataset?: string
  movementCount: number
  lastMovement?: { name: string; code?: number; occurredAt: string; complementKeys?: string[] }
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
  /** Todos os assuntos, na ordem da fonte (o primeiro é o principal). */
  subjects?: string[]

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

  /**
   * Todos os registros que a fonte devolveu para o número, do mais recente ao mais
   * antigo. Os demais campos vêm do primeiro; os outros ficam aqui como evidência.
   */
  records?: ExternalRecord[]

  source: {
    provider: ProviderName
    externalId?: string
    /** Índice/endpoint consultado, útil em log e suporte. */
    dataset?: string
  }
}

/**
 * Fornecedor de dados processuais. Implementações moram em
 * `lib/integrations/legal/<provider>/provider.ts` e rodam só no servidor.
 */
export interface ProcessProvider {
  name: ProviderName
  /**
   * Consulta por CNJ (20 dígitos já validados). `null` quando a fonte não tem
   * o processo; falhas lançam `LookupError` (`../errors`).
   */
  lookup(digits: string): Promise<ExternalProcess | null>
  /**
   * Registros do número no índice de um tribunal específico (ex.: o superior do
   * segmento). Lista vazia = nada encontrado ali — o que não prova ausência de
   * tramitação. Falhas lançam `LookupError`.
   */
  lookupRecords?(digits: string, tribunal: string): Promise<{ dataset: string; records: ExternalRecord[] }>
}
