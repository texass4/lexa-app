/**
 * Tradução do JSON bruto do DataJud para o modelo externo da Íntegra.
 *
 * Todo detalhe do formato da fonte (`hits`, `_source`, `numeroProcesso`,
 * `orgaoJulgador`, `movimentos`…) morre neste arquivo. A UI e o restante da
 * aplicação só veem `ExternalProcess`.
 *
 * A API pública é um índice de metadados: campos podem faltar, vir vazios ou
 * mudar de formato. Nada aqui assume presença de dado — e nada é inventado.
 */

import { onlyDigits } from "@/lib/processos/cnj"
import type { MovementComplement, MovementJudicialUnit } from "@/types"
import type { ExternalCoverage, ExternalMovement, ExternalParty, ExternalProcess, ExternalRecord } from "../types"

/* ------------------------- formato bruto da fonte ------------------------- */

interface DataJudNamed {
  codigo?: number
  nome?: string
}

/**
 * Complemento tabelado. Atenção aos nomes: no DataJud `descricao` é o
 * identificador técnico ("tipo_de_documento") e `nome` é o texto legível
 * ("Certidão") — o contrário do que os nomes sugerem.
 */
interface DataJudComplement {
  codigo?: number
  valor?: number
  nome?: string
  descricao?: string
}

export interface DataJudRawMovement {
  codigo?: number
  nome?: string
  dataHora?: string
  complementosTabelados?: DataJudComplement[]
  /** Na movimentação, o código do órgão vem como texto (ex.: "16293"). */
  orgaoJulgador?: { codigo?: number | string; nome?: string }
}

/** Partes não são garantidas pela API pública — mapeadas só se vierem. */
interface DataJudRawParty {
  nome?: string
  documento?: string
  tipoPessoa?: string
  papel?: string
  polo?: string
}

export interface DataJudRawSource {
  numeroProcesso?: string
  id?: string
  tribunal?: string
  grau?: string
  classe?: DataJudNamed
  sistema?: DataJudNamed
  formato?: DataJudNamed
  assuntos?: DataJudNamed[]
  orgaoJulgador?: DataJudNamed & { codigoMunicipioIBGE?: number }
  dataAjuizamento?: string
  dataHoraUltimaAtualizacao?: string
  nivelSigilo?: number
  situacao?: DataJudNamed | string
  movimentos?: DataJudRawMovement[]
  partes?: DataJudRawParty[]
  poloAtivo?: DataJudRawParty[]
  poloPassivo?: DataJudRawParty[]
}

export interface DataJudHit {
  _index?: string
  _id?: string
  _source?: DataJudRawSource
}

export interface DataJudSearchResponse {
  took?: number
  timed_out?: boolean
  /** Shards que falharam ainda devolvem HTTP 200, só que com hits faltando. */
  _shards?: { total?: number; successful?: number; failed?: number }
  hits?: {
    /** `relation: "gte"` = pelo menos `value` (contagem não exata). */
    total?: { value?: number; relation?: string }
    hits?: DataJudHit[]
  }
}

/* -------------------------------- helpers -------------------------------- */

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

/**
 * Mantém apenas datas que o JS consegue interpretar, preservando o texto
 * original.
 *
 * Nada de converter fuso aqui: a fonte informa a hora do ato como ela aparece
 * nos autos, e reinterpretar isso como UTC deslocaria datas de ajuizamento e
 * horários de audiência.
 */
const isoDate = (value: unknown): string | undefined => {
  const raw = text(value)
  if (!raw) return undefined
  return Number.isNaN(Date.parse(raw)) ? undefined : raw
}

const situationName = (situacao: DataJudRawSource["situacao"]): string | undefined =>
  typeof situacao === "string" ? text(situacao) : text(situacao?.nome)

function partyType(tipoPessoa: unknown): ExternalParty["type"] | undefined {
  const raw = text(tipoPessoa)?.toUpperCase()
  if (!raw) return undefined
  if (raw.startsWith("F")) return "individual"
  if (raw.startsWith("J")) return "company"
  return undefined
}

function mapParty(raw: DataJudRawParty): ExternalParty | null {
  const name = text(raw?.nome)
  if (!name) return null
  return {
    name,
    document: text(raw.documento),
    type: partyType(raw.tipoPessoa),
    role: text(raw.papel),
  }
}

/**
 * Partes por polo. Sem polo explícito, a parte vai para `others` —
 * autor e réu nunca são deduzidos a partir do nome ou da ordem.
 */
function mapParties(source: DataJudRawSource): ExternalProcess["parties"] {
  const active: ExternalParty[] = []
  const passive: ExternalParty[] = []
  const others: ExternalParty[] = []

  for (const raw of source.poloAtivo ?? []) {
    const party = mapParty(raw)
    if (party) active.push(party)
  }
  for (const raw of source.poloPassivo ?? []) {
    const party = mapParty(raw)
    if (party) passive.push(party)
  }
  for (const raw of source.partes ?? []) {
    const party = mapParty(raw)
    if (!party) continue
    const polo = text(raw.polo)?.toUpperCase()
    if (polo === "AT" || polo === "ATIVO") active.push(party)
    else if (polo === "PA" || polo === "PASSIVO") passive.push(party)
    else others.push(party)
  }

  return { active, passive, others }
}

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

/** Complementos no modelo neutro, campo a campo, sem descartar nenhum. */
function mapComplements(raw: DataJudRawMovement): MovementComplement[] {
  return (raw.complementosTabelados ?? [])
    .filter((c): c is DataJudComplement => !!c && typeof c === "object")
    .map((c) => ({ code: num(c.codigo), key: text(c.descricao), value: num(c.valor), name: text(c.nome) }))
}

function mapMovementUnit(raw: DataJudRawMovement): MovementJudicialUnit | undefined {
  const unit = raw.orgaoJulgador
  if (!unit) return undefined
  const code = typeof unit.codigo === "number" ? String(unit.codigo) : text(unit.codigo)
  const name = text(unit.nome)
  return code || name ? { code, name } : undefined
}

export function mapMovements(source: DataJudRawSource): ExternalMovement[] {
  const movements: ExternalMovement[] = []

  for (const raw of source.movimentos ?? []) {
    const occurredAt = isoDate(raw?.dataHora)
    // Sem data não há como ordenar nem deduplicar de forma estável.
    if (!occurredAt) continue

    const complements = mapComplements(raw)
    // Descrição = texto legível dos complementos (`nome`). A chave técnica
    // (`descricao`) fica guardada em `complements`, mas nunca vira texto de tela.
    const readable = complements.map((c) => c.name).filter((name): name is string => !!name)

    movements.push({
      code: num(raw.codigo),
      name: text(raw.nome) ?? "Movimentação",
      description: readable.length ? readable.join(" · ") : undefined,
      occurredAt,
      complements: complements.length ? complements : undefined,
      judicialUnit: mapMovementUnit(raw),
      raw,
    })
  }

  return movements.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

/**
 * Um mesmo número pode ter vários documentos (graus diferentes, reprocessos).
 * Escolhe o mais recentemente atualizado; empate, o que tem mais movimentações.
 */
/**
 * Documentos do número pedido. A busca é por `numeroProcesso`; um documento com outro
 * número (resposta inesperada do índice) não vira evidência deste processo. Sem número
 * pedido (`requested` vazio), todos valem.
 */
const hitsOf = (response: DataJudSearchResponse, requested = "") => {
  const digits = onlyDigits(requested)
  return (response?.hits?.hits ?? []).filter((hit) => {
    if (!hit?._source) return false
    const number = onlyDigits(text(hit._source.numeroProcesso) ?? "")
    return !digits || !number || number === digits
  })
}

/** Mais recente primeiro; empate → mais movimentações. */
function compareHits(a: DataJudHit, b: DataJudHit) {
  const aAt = isoDate(a._source?.dataHoraUltimaAtualizacao) ?? ""
  const bAt = isoDate(b._source?.dataHoraUltimaAtualizacao) ?? ""
  if (aAt !== bAt) return bAt.localeCompare(aAt)
  return (b._source?.movimentos?.length ?? 0) - (a._source?.movimentos?.length ?? 0)
}

/** Resumo de um documento da fonte — evidência, não conclusão. */
function toRecord(hit: DataJudHit): ExternalRecord {
  const source = hit._source ?? {}
  const [last] = mapMovements(source)
  const keys = last?.complements?.map((c) => c.key).filter((key): key is string => !!key)
  return {
    tribunal: text(source.tribunal)?.toUpperCase(),
    degree: text(source.grau),
    judicialUnit: text(source.orgaoJulgador?.nome),
    updatedAt: isoDate(source.dataHoraUltimaAtualizacao),
    dataset: text(hit._index),
    movementCount: source.movimentos?.length ?? 0,
    lastMovement: last
      ? { name: last.name, code: last.code, occurredAt: last.occurredAt, description: last.description, complementKeys: keys?.length ? keys : undefined }
      : undefined,
  }
}

/** Todos os registros do número na resposta, do mais recente ao mais antigo. */
export function mapRecords(response: DataJudSearchResponse, requestedCnj = ""): ExternalRecord[] {
  return [...hitsOf(response, requestedCnj)].sort(compareHits).map(toRecord)
}

/**
 * A resposta cobre todos os registros? Parcial quando a fonte avisa que fragmentos do
 * índice falharam ou o tempo esgotou (com registros — sem nenhum, o cliente já trata como
 * indisponível); truncada quando o total informado passa do que veio.
 */
export function mapCoverage(response: DataJudSearchResponse, requestedCnj = ""): ExternalCoverage {
  const all = (response?.hits?.hits ?? []).filter((hit) => !!hit?._source).length
  const returned = hitsOf(response, requestedCnj).length
  const total = typeof response?.hits?.total?.value === "number" ? response.hits.total.value : undefined
  return {
    partial: !!response?.timed_out || (response?._shards?.failed ?? 0) > 0,
    truncated: (total !== undefined && total > all) || response?.hits?.total?.relation === "gte",
    returned,
    total,
  }
}

/**
 * Documento que preenche a ficha: o atualizado mais recentemente. É só o registro de
 * onde vêm os dados exibidos — não prova em que tribunal ou grau o processo está hoje
 * (os demais registros seguem em `records`).
 */
function pickBestHit(response: DataJudSearchResponse, requestedCnj: string): DataJudHit | null {
  return [...hitsOf(response, requestedCnj)].sort(compareHits)[0] ?? null
}

/** Resposta bruta → `ExternalProcess`. `null` quando a fonte não achou nada. */
export function mapSearchResponse(response: DataJudSearchResponse, requestedCnj: string): ExternalProcess | null {
  const hit = pickBestHit(response, requestedCnj)
  if (!hit?._source) return null

  const source = hit._source
  const cnj = onlyDigits(text(source.numeroProcesso) ?? "") || onlyDigits(requestedCnj)
  const movements = mapMovements(source)
  const parties = mapParties(source)
  const judicialUnit = source.orgaoJulgador
    ? {
        code: typeof source.orgaoJulgador.codigo === "number" ? source.orgaoJulgador.codigo : undefined,
        name: text(source.orgaoJulgador.nome),
        municipalityCode: typeof source.orgaoJulgador.codigoMunicipioIBGE === "number" ? source.orgaoJulgador.codigoMunicipioIBGE : undefined,
      }
    : undefined

  return {
    cnj,
    tribunal: text(source.tribunal),
    degree: text(source.grau),
    className: text(source.classe?.nome),
    // A fonte devolve uma lista de assuntos; o primeiro é o principal.
    subject: source.assuntos?.map((a) => text(a?.nome)).find((name): name is string => !!name),
    subjects: (source.assuntos ?? []).map((a) => text(a?.nome)).filter((name): name is string => !!name),
    system: text(source.sistema?.nome),
    format: text(source.formato?.nome),
    filedAt: isoDate(source.dataAjuizamento),
    updatedAt: isoDate(source.dataHoraUltimaAtualizacao),
    judicialUnit: judicialUnit?.name || judicialUnit?.code !== undefined ? judicialUnit : undefined,
    parties,
    status: situationName(source.situacao),
    secrecyLevel: typeof source.nivelSigilo === "number" ? source.nivelSigilo : undefined,
    movements,
    records: mapRecords(response, requestedCnj),
    coverage: mapCoverage(response, requestedCnj),
    source: {
      provider: "datajud",
      externalId: text(source.id) ?? text(hit._id),
      dataset: text(hit._index),
    },
  }
}
