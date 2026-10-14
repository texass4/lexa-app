/**
 * Tribunal de origem × tribunal atual × tribunal inferido — lógica pura (sem rede).
 *
 * - ORIGEM: pelo número CNJ (`J.TR`). Certo enquanto o número for válido, mas só diz
 *   onde o processo começou.
 * - ATUAL: só pela fonte consultada, e só com evidência suficiente. Critérios para
 *   `confirmed` — todos precisam valer:
 *     1. algum índice consultado devolveu registro do número;
 *     2. todos os registros encontrados apontam o MESMO tribunal, e ele é o tribunal do
 *        índice em que foram achados (senão: `conflicting`);
 *     3. o registro mais recente informa o tribunal (campo da fonte presente);
 *     4. o registro mais recente tem data de atualização na fonte;
 *     5. a última movimentação desse tribunal não indica remessa, redistribuição,
 *        declínio de competência, devolução nem baixa/arquivamento;
 *     6. nenhuma outra consulta falhou (uma fonte sem resposta pode ter outro registro).
 *   O grau só é informado quando um único grau aparece nos registros.
 * - INFERIDO: quando o atual não está confirmado — o registro atualizado mais recentemente
 *   ou, sem registro, o tribunal de origem. Sempre exibido como inferência.
 *
 * Consulta a tribunal superior é complementar: não achar o número lá não prova que o
 * processo não tramite lá (o índice pode usar outra numeração ou estar atrasado).
 */

import { parseCNJ } from "@/lib/processos/cnj"
import { originAcronym, originTribunal, tribunalByAcronym, tribunalName } from "@/lib/processos/tribunals"
import { datasetFor, isCovered, tribunalFor, tribunalOfDataset } from "@/lib/integrations/legal/datajud/tribunals"
import type { ExternalRecord } from "@/lib/integrations/legal/types"
import { fold } from "@/lib/core/format"
import type { Process, TribunalCheck, TribunalIdentification, TribunalRecordEvidence } from "@/types"
import { categorizeMovement } from "./movement-interpreter"
import type { ProcessSheet } from "./sheet"

/** Registro da fonte com o que a identificação precisa (inclui pistas da última movimentação). */
type RecordInput = TribunalRecordEvidence & { lastMovement?: TribunalRecordEvidence["lastMovement"] & { code?: number; complementKeys?: string[] } }

export interface CheckInput extends Omit<TribunalCheck, "records"> {
  records: RecordInput[]
}

const day = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10).split("-").reverse().join("/") : undefined)

/** Trechos (sem acento) de movimentação que indicam saída do tribunal ou do órgão. */
const TRANSFER_HINTS = ["remessa", "remetid", "redistribu", "declin", "incompetencia", "devolucao", "devolvid", "baixa", "arquivamento", "arquivado"]

/** Motivo pelo qual a última movimentação impede confirmar o tribunal atual (ou `undefined`). */
export function transferSignal(movement: RecordInput["lastMovement"]): string | undefined {
  if (!movement) return undefined
  const label = `“${movement.name}”${day(movement.occurredAt) ? `, em ${day(movement.occurredAt)}` : ""}`
  if (categorizeMovement({ code: movement.code, name: movement.name }) === "baixa") return `A última movimentação (${label}) indica baixa ou arquivamento — os autos podem ter voltado à origem.`
  const folded = fold(movement.name)
  if (TRANSFER_HINTS.some((hint) => folded.includes(hint)) || movement.complementKeys?.includes("motivo_da_remessa")) {
    return `A última movimentação (${label}) pode indicar envio a outro órgão ou tribunal.`
  }
  return undefined
}

/** Evidência que fica guardada (sem as pistas internas da movimentação). */
const evidence = (r: RecordInput): TribunalRecordEvidence => ({
  tribunal: r.tribunal,
  degree: r.degree,
  judicialUnit: r.judicialUnit,
  updatedAt: r.updatedAt,
  dataset: r.dataset,
  lastMovement: r.lastMovement ? { name: r.lastMovement.name, occurredAt: r.lastMovement.occurredAt } : undefined,
})

/** Mesma sigla, sem hífen e com o apelido conhecido do TJDFT. */
const ALIASES: Record<string, string> = { TJDF: "TJDFT" }
const canonical = (acronym: string) => {
  const a = acronym.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return ALIASES[a] ?? a
}
export const sameTribunal = (a?: string, b?: string) => !!a && !!b && canonical(a) === canonical(b)

const newestFirst = (a: { updatedAt?: string }, b: { updatedAt?: string }) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")

export function identifyTribunal(cnj: string, checks: CheckInput[], identifiedAt: string): TribunalIdentification {
  const parts = parseCNJ(cnj)
  const origin = parts?.checkDigitsValid ? originTribunal(parts.digits) : undefined
  const originInfo: TribunalIdentification["origin"] = {
    acronym: origin?.acronym,
    name: origin?.name,
    segment: origin?.segment,
    source: "cnj",
    covered: isCovered(origin?.acronym),
  }
  const stored: TribunalCheck[] = checks.map((c) => ({ ...c, records: c.records.map(evidence) }))
  const base = { origin: originInfo, checks: stored, identifiedAt }

  const fromOrigin = (note: string): TribunalIdentification["inferred"] =>
    origin ? { acronym: origin.acronym, name: origin.name, basis: "cnj", note } : undefined
  const ORIGIN_NOTE = "Deduzido do número CNJ: é o tribunal de origem e não indica onde o processo tramita hoje."

  if (!parts || !parts.checkDigitsValid) {
    return { ...base, current: { status: "not_checked", reasons: ["Número CNJ inválido: o tribunal não foi identificado."] } }
  }

  const found = checks.filter((c) => c.status === "found" && c.records.length)
  const failed = checks.filter((c) => c.status === "failed")
  const superiorNotes = checks
    .filter((c) => c.role === "superior" && c.status !== "found")
    .map((c) =>
      c.status === "failed"
        ? `A consulta ao ${c.tribunal} não respondeu: a tramitação lá não foi verificada.`
        : c.status === "not_found"
          ? `Não localizado na consulta ao ${c.tribunal}. A ausência não prova que o processo não tramite lá.`
          : `O ${c.tribunal} não foi consultado.`,
    )

  /* Sem registro em nenhum índice ------------------------------------------ */
  if (!found.length) {
    const originCheck = checks.find((c) => c.role === "origem")
    if (!originInfo.covered && !originCheck) {
      const reason = origin
        ? `Não há fonte consultável para o ${origin.acronym}: o tribunal atual não foi verificado.`
        : `O código do tribunal (${parts.segment}.${parts.tribunalCode}) não existe na numeração única: o tribunal não foi identificado.`
      return { ...base, current: { status: "unsupported", reasons: [reason, ...superiorNotes] }, inferred: fromOrigin(ORIGIN_NOTE) }
    }
    if (!originCheck || originCheck.status === "failed" || originCheck.status === "not_checked") {
      return {
        ...base,
        current: { status: "not_checked", reasons: ["Nenhuma consulta à fonte foi concluída: o tribunal atual não foi verificado.", ...superiorNotes] },
        inferred: fromOrigin(ORIGIN_NOTE),
      }
    }
    return {
      ...base,
      current: {
        status: "not_found",
        source: "datajud",
        dataset: originCheck.dataset,
        checkedAt: originCheck.checkedAt,
        reasons: [
          `Nenhum registro do número na consulta ao ${originCheck.tribunal}. Pode ser atraso de indexação, segredo de justiça ou tramitação em outro tribunal — a ausência não prova onde o processo está.`,
          ...superiorNotes,
        ],
      },
      inferred: fromOrigin(ORIGIN_NOTE),
    }
  }

  /* Há registros: confere os critérios ------------------------------------- */
  const records = found
    .flatMap((c) => c.records.map((r) => ({ ...r, indexTribunal: c.tribunal, check: c })))
    .sort(newestFirst)
  const latest = records[0]
  const inferredFromLatest = (): TribunalIdentification["inferred"] => {
    const acronym = latest.tribunal ?? latest.indexTribunal
    return {
      acronym,
      name: tribunalName(acronym),
      basis: "registro_mais_recente",
      note: `Inferido do registro atualizado mais recentemente na fonte${day(latest.updatedAt) ? ` (${day(latest.updatedAt)})` : ""}; não confirmado.`,
    }
  }
  const listed = (list: typeof records) =>
    list.map((r) => `${r.tribunal ?? r.indexTribunal}${r.degree ? ` (${r.degree})` : ""}${day(r.updatedAt) ? ` — atualizado em ${day(r.updatedAt)}` : ""}`).join("; ")

  // Critério 2: um tribunal só, igual ao do índice.
  const mismatched = records.filter((r) => r.tribunal && !sameTribunal(r.tribunal, r.indexTribunal))
  // O tribunal de cada registro é o do índice quando os dois coincidem (grafia da Íntegra).
  const tribunals = [...new Set(records.map((r) => (r.tribunal && !sameTribunal(r.tribunal, r.indexTribunal) ? r.tribunal : r.indexTribunal)))]
  if (mismatched.length || tribunals.length > 1) {
    const reasons = [
      tribunals.length > 1
        ? `Há registros em mais de um tribunal: ${listed(records)}. Sem como saber, pela fonte, onde o processo tramita agora.`
        : `Um registro encontrado na consulta ao ${mismatched[0].indexTribunal} informa outro tribunal (${mismatched[0].tribunal}).`,
      ...superiorNotes,
    ]
    return { ...base, current: { status: "conflicting", source: "datajud", checkedAt: latest.check.checkedAt, reasons }, inferred: inferredFromLatest() }
  }

  const acronym = canonical(tribunals[0]) === canonical(latest.indexTribunal) ? latest.indexTribunal : tribunals[0]
  const missing: string[] = []
  // Critério 3, 4, 5, 6.
  if (!latest.tribunal) missing.push(`O registro encontrado na consulta ao ${latest.indexTribunal} não informa o tribunal.`)
  if (!latest.updatedAt) missing.push("O registro não tem data de atualização na fonte.")
  const lastMovement = records
    .map((r) => r.lastMovement)
    .filter((m): m is NonNullable<RecordInput["lastMovement"]> => !!m)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
  if (!lastMovement) missing.push("Os registros não trazem movimentações para conferir se houve remessa ou baixa.")
  const signal = transferSignal(lastMovement)
  if (signal) missing.push(signal)
  for (const c of failed) missing.push(`A consulta ao ${c.tribunal} não respondeu: pode haver registro lá.`)

  const degrees = [...new Set(records.map((r) => r.degree).filter(Boolean))]
  const units = [...new Set(records.map((r) => r.judicialUnit).filter(Boolean))]
  const degreeNote = degrees.length > 1 ? [`Registros em mais de um grau (${degrees.join(", ")}): o grau atual não foi confirmado.`] : []
  const info = tribunalByAcronym(acronym)

  if (missing.length) {
    return {
      ...base,
      current: {
        status: "not_confirmed",
        source: "datajud",
        dataset: latest.dataset ?? latest.check.dataset,
        updatedAt: latest.updatedAt,
        checkedAt: latest.check.checkedAt,
        reasons: [...missing, ...degreeNote, ...superiorNotes],
      },
      inferred: inferredFromLatest(),
    }
  }

  return {
    ...base,
    current: {
      status: "confirmed",
      acronym,
      name: info?.name ?? acronym,
      degree: degrees.length === 1 ? degrees[0] : undefined,
      judicialUnit: units.length === 1 && records.length === 1 ? units[0] : undefined,
      source: "datajud",
      dataset: latest.dataset ?? latest.check.dataset,
      updatedAt: latest.updatedAt,
      checkedAt: latest.check.checkedAt,
      reasons: [
        `O registro da fonte informa o tribunal ${acronym}${day(latest.updatedAt) ? `, atualizado em ${day(latest.updatedAt)}` : ""}.`,
        "A última movimentação não indica remessa, redistribuição nem baixa.",
        ...degreeNote,
        ...superiorNotes,
      ],
    },
  }
}

/* ------------------------------ entradas comuns ----------------------------- */

/** Registros de uma ficha (fichas antigas do cache, sem `records`, usam os campos da própria ficha). */
export function sheetRecords(sheet: ProcessSheet): ExternalRecord[] {
  if (sheet.records?.length) return sheet.records
  const [last] = sheet.movements
  return [
    {
      tribunal: sheet.tribunal?.toUpperCase(),
      degree: sheet.degree,
      judicialUnit: sheet.judicialUnit,
      updatedAt: sheet.updatedAt,
      dataset: sheet.source.dataset,
      movementCount: sheet.movements.length,
      lastMovement: last
        ? { name: last.name, code: last.code, occurredAt: last.occurredAt, complementKeys: last.complements?.map((c) => c.key).filter((k): k is string => !!k) }
        : undefined,
    },
  ]
}

/** Consulta ao tribunal de origem a partir da ficha que a fonte devolveu. */
export function originCheckFromSheet(sheet: ProcessSheet, checkedAt: string): CheckInput {
  const tribunal = tribunalOfDataset(sheet.source.dataset) ?? tribunalFor(sheet.cnj) ?? originAcronym(sheet.cnj) ?? "?"
  return {
    tribunal,
    role: "origem",
    status: "found",
    provider: "datajud",
    dataset: sheet.source.dataset ?? (isCovered(tribunal) ? datasetFor(tribunal) : undefined),
    checkedAt,
    records: sheetRecords(sheet),
  }
}

/** Identificação a partir só da ficha (importação e sincronização: sem consulta ao superior). */
export function identifyFromSheet(sheet: ProcessSheet, checkedAt: string): TribunalIdentification {
  return identifyTribunal(sheet.cnj, [originCheckFromSheet(sheet, checkedAt)], checkedAt)
}

/**
 * Identificação de um processo salvo. Cadastros anteriores a esta verificação não têm
 * evidência guardada: a origem sai do número e o atual fica `not_checked` — o tribunal
 * do cadastro continua aparecendo como dado do escritório, nunca como "atual".
 */
export function tribunalIdentificationOf(process: Pick<Process, "cnj" | "number" | "tribunal" | "tribunalIdentification">): TribunalIdentification | undefined {
  if (process.tribunalIdentification) return process.tribunalIdentification
  const digits = parseCNJ(process.cnj ?? process.number ?? "")?.digits
  if (!digits) return undefined
  const identification = identifyTribunal(digits, [], "")
  if (identification.current.status === "unsupported") return identification
  return {
    ...identification,
    current: {
      status: "not_checked",
      reasons: [
        process.tribunal
          ? `Cadastro anterior à verificação do tribunal atual: o tribunal registrado (${process.tribunal}) não tem evidência de consulta guardada.`
          : "O tribunal atual ainda não foi verificado na fonte.",
      ],
    },
  }
}

/** Rótulos curtos da situação do tribunal atual. */
export const CURRENT_STATUS_LABEL: Record<TribunalIdentification["current"]["status"], string> = {
  confirmed: "Confirmado pela fonte",
  not_confirmed: "Não confirmado",
  conflicting: "Registros divergentes",
  not_found: "Não localizado na fonte",
  unsupported: "Sem fonte para este tribunal",
  not_checked: "Não verificado",
}

/** "TJSP — Tribunal de Justiça do Estado de São Paulo" */
export const tribunalLabel = (acronym?: string, name?: string) => (acronym ? (name && name !== acronym ? `${acronym} — ${name}` : acronym) : undefined)

/**
 * Tribunal para o contexto da IA: origem, atual e inferido separados, com a fonte.
 * Sem confirmação, o aviso diz para não afirmar onde o processo tramita hoje.
 */
export function describeTribunalForAI(id: TribunalIdentification | undefined) {
  if (!id) return undefined
  const { origin, current, inferred } = id
  const confirmed = current.status === "confirmed"
  return {
    tribunal_de_origem: origin.acronym
      ? `${tribunalLabel(origin.acronym, origin.name)} (pelo número CNJ — indica onde o processo começou, não onde tramita hoje)`
      : "não identificado pelo número",
    tribunal_atual: {
      situacao: CURRENT_STATUS_LABEL[current.status],
      tribunal: confirmed ? tribunalLabel(current.acronym, current.name) : undefined,
      grau: confirmed ? current.degree : undefined,
      fonte: current.source === "datajud" ? "DataJud (CNJ), consulta pública" : undefined,
      indice_consultado: current.dataset,
      atualizado_na_fonte: current.updatedAt,
      consultado_em: current.checkedAt,
      motivos: current.reasons,
    },
    tribunal_inferido:
      !confirmed && inferred ? { tribunal: tribunalLabel(inferred.acronym, inferred.name), observacao: `${inferred.note} É uma inferência.` } : undefined,
    aviso: confirmed ? undefined : "Tribunal atual não confirmado pela fonte: não afirme em que tribunal o processo tramita hoje.",
  }
}
