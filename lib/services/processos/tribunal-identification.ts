/**
 * Tribunal de origem × tribunal atual × tribunal inferido — lógica pura (sem rede).
 *
 * - ORIGEM: pelo número CNJ (`J.TR`). Certo enquanto o número for válido, mas só diz
 *   onde o processo começou.
 * - ATUAL: só pela fonte consultada, e só com evidência suficiente. Critérios para
 *   `confirmed` — todos precisam valer:
 *     1. algum índice consultado devolveu registro do número;
 *     2. todos os registros encontrados apontam o MESMO tribunal, e ele é o tribunal do
 *        índice em que foram achados (senão: `conflicting`, sem escolher nenhum);
 *     3. o registro mais recente informa o tribunal (campo da fonte presente);
 *     4. o registro mais recente tem data de atualização na fonte;
 *     5. há movimentação, e a última não indica de forma explícita a saída do tribunal
 *        (remessa a tribunal superior ou a outra Justiça, declínio de competência, baixa
 *        num tribunal superior, envio à instância superior a partir do 2º grau);
 *     6. nenhuma outra consulta falhou (uma fonte sem resposta pode ter outro registro);
 *     7. as respostas com registro vieram completas (sem fragmento falho nem truncamento).
 *   O grau só é informado quando um único grau aparece nos registros.
 * - INFERIDO: quando o atual não está confirmado e NÃO há divergência — o tribunal dos
 *   registros encontrados ou, sem registro, o de origem. Sempre exibido como inferência.
 *   Com divergência, os tribunais com registro são listados (`candidates`), sem escolha.
 *
 * Consulta a tribunal superior é complementar: não achar o número lá não prova que o
 * processo não tramite lá (o índice pode usar outra numeração ou estar atrasado).
 *
 * Persistência: a identificação guardada no processo acumula a consulta mais recente de
 * cada índice (`mergeChecks`). A sincronização (só origem) não apaga a consulta ao
 * superior feita pela Consulta processual — uma divergência continua divergência até
 * uma nova consulta ao mesmo índice.
 *
 * Datas: as da fonte ficam em horário de parede, lidas literalmente (como no resto da
 * ficha); as nossas (consulta, tentativa) em horário local do escritório. Tudo sem fuso,
 * para comparar e exibir do mesmo jeito.
 */

import { toLocalISOIn } from "@/lib/core/dates"
import { fold } from "@/lib/core/format"
import { parseCNJ } from "@/lib/processos/cnj"
import { originAcronym, originTribunal, tribunalByAcronym, tribunalName } from "@/lib/processos/tribunals"
import { datasetFor, isCovered, tribunalFor, tribunalOfDataset } from "@/lib/integrations/legal/datajud/tribunals"
import type { ExternalCoverage, ExternalRecord } from "@/lib/integrations/legal/types"
import type { CurrentTribunalStatus, Process, TribunalAttempt, TribunalCheck, TribunalIdentification, TribunalRecordEvidence } from "@/types"
import { categorizeMovement } from "./movement-interpreter"
import { OFFICE_TIME_ZONE } from "./monitoring-policy"
import { toLocal, type ProcessSheet } from "./sheet"

export type CheckInput = TribunalCheck

/* ---------------------------------- datas ---------------------------------- */

/** Data da fonte → horário de parede sem fuso (leitura literal, como `buildProcessSheet`). */
export const sourceTime = (value?: string) => (value ? (toLocal(value) ?? value) : undefined)

/**
 * Momento nosso (consulta, tentativa) → horário local do escritório, sem fuso. Com `Z` ou
 * deslocamento, converte; sem fuso, já é horário local e só padroniza o formato.
 */
export function officeTime(value?: string): string | undefined {
  if (!value) return undefined
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : toLocalISOIn(date, OFFICE_TIME_ZONE)
  }
  return toLocal(value) ?? value
}

const day = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10).split("-").reverse().join("/") : undefined)

const normalizeRecord = (r: TribunalRecordEvidence): TribunalRecordEvidence => ({
  ...r,
  tribunal: r.tribunal?.trim().toUpperCase() || undefined,
  updatedAt: sourceTime(r.updatedAt),
  lastMovement: r.lastMovement ? { ...r.lastMovement, occurredAt: sourceTime(r.lastMovement.occurredAt) ?? r.lastMovement.occurredAt } : undefined,
})

const normalizeCheck = (c: TribunalCheck): TribunalCheck => ({ ...c, checkedAt: officeTime(c.checkedAt), records: c.records.map(normalizeRecord) })

/* --------------------------- saída do tribunal ----------------------------- */

const SUPERIOR_COURTS = new Set(["STF", "STJ", "TST", "TSE", "STM"])
/** Graus que já são a instância mais alta do tribunal: "instância superior" a partir deles sai do tribunal. */
const TOP_DEGREES = new Set(["G2", "TR", "TRU", "TNU", "SUP"])

/** Verbos de deslocamento dos autos. Sozinhos, NÃO bastam ("Remessa ao Contador"). */
const MOVE = /\b(remessa|remetid\w*|remet\w*|envi\w*|encaminh\w*|subida|redistribu\w*)\b/
/** Destino fora do tribunal, explícito no texto. */
const OUT_OF_TRIBUNAL =
  /\b(stj|stf|tst|tse|stm|superior tribunal|supremo tribunal|tribunal superior|outro tribunal|justica (federal|estadual|do trabalho|eleitoral|militar))\b/
const UPPER_INSTANCE = /\b(instancia superior|grau de recurso|grau recursal)\b/
const DECLINE = /\b(declin\w*|incompetencia)\b/

export interface TransferSignal {
  /** Impede confirmar o tribunal atual. Sinais informativos (baixa na origem) não impedem. */
  blocks: boolean
  text: string
}

/**
 * O que a última movimentação diz sobre a saída do tribunal. Só bloqueia com indício
 * explícito: palavras genéricas ("devolvido", "remessa ao contador", "arquivado") não bastam.
 */
export function transferSignal(
  movement: TribunalRecordEvidence["lastMovement"],
  record: { degree?: string; tribunal?: string } = {},
): TransferSignal | undefined {
  if (!movement) return undefined
  const label = `“${movement.name}”${day(movement.occurredAt) ? `, em ${day(movement.occurredAt)}` : ""}`
  const text = fold(`${movement.name} ${movement.description ?? ""}`)
  const tribunal = record.tribunal?.toUpperCase()

  if (DECLINE.test(text)) return { blocks: true, text: `A última movimentação (${label}) indica declínio de competência: o processo pode ter ido para outro juízo ou tribunal.` }
  if (MOVE.test(text) && OUT_OF_TRIBUNAL.test(text)) return { blocks: true, text: `A última movimentação (${label}) indica envio dos autos para fora deste tribunal.` }
  if (MOVE.test(text) && UPPER_INSTANCE.test(text) && TOP_DEGREES.has(record.degree?.toUpperCase() ?? "")) {
    return { blocks: true, text: `A última movimentação (${label}) indica envio à instância superior a partir do grau ${record.degree}: fora deste tribunal.` }
  }
  if (categorizeMovement({ code: movement.code, name: movement.name }) === "baixa") {
    return tribunal && SUPERIOR_COURTS.has(tribunal)
      ? { blocks: true, text: `A última movimentação no ${tribunal} (${label}) indica baixa: os autos podem ter voltado ao tribunal de origem.` }
      : { blocks: false, text: `A última movimentação (${label}) indica baixa ou arquivamento no próprio tribunal.` }
  }
  return undefined
}

/* ------------------------------- consultas --------------------------------- */

/** Mesma sigla, sem hífen e com o apelido conhecido do TJDFT. */
const ALIASES: Record<string, string> = { TJDF: "TJDFT" }
const canonical = (acronym: string) => {
  const a = acronym.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return ALIASES[a] ?? a
}
export const sameTribunal = (a?: string, b?: string) => !!a && !!b && canonical(a) === canonical(b)

const newestFirst = (a: { updatedAt?: string }, b: { updatedAt?: string }) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")

const checkKey = (c: Pick<TribunalCheck, "role" | "tribunal">) => `${c.role}:${canonical(c.tribunal)}`

/**
 * Junta consultas guardadas com consultas novas: por índice (papel + tribunal), fica a
 * mais recente; em empate, a nova. Consultas a outros índices continuam valendo.
 */
export function mergeChecks(previous: TribunalCheck[] | undefined, incoming: TribunalCheck[]): TribunalCheck[] {
  const merged = new Map<string, TribunalCheck>()
  for (const check of [...(previous ?? []), ...incoming].map(normalizeCheck)) {
    const key = checkKey(check)
    const kept = merged.get(key)
    if (!kept || (check.checkedAt ?? "") >= (kept.checkedAt ?? "")) merged.set(key, check)
  }
  // Origem primeiro, depois superiores: a ordem de exibição não depende de quem chegou antes.
  return [...merged.values()].sort((a, b) => (a.role === b.role ? 0 : a.role === "origem" ? -1 : 1))
}

const incompleteText = (c: TribunalCheck) =>
  c.coverage?.partial
    ? `A resposta da consulta ao ${c.tribunal} veio parcial (parte do índice não respondeu): pode haver outros registros.`
    : c.coverage?.truncated
      ? `A consulta ao ${c.tribunal} devolveu ${c.coverage.returned} de ${c.coverage.total ?? "mais"} registros: pode haver outros registros.`
      : undefined

/** Tentativa implícita numa identificação: a da consulta de origem (ou da mais recente). */
function attemptOf(checks: TribunalCheck[]): TribunalAttempt | undefined {
  const check = checks.find((c) => c.role === "origem") ?? [...checks].sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""))[0]
  if (!check?.checkedAt || check.status === "not_checked") return undefined
  return { at: check.checkedAt, tribunal: check.tribunal, outcome: check.status === "found" ? "found" : check.status === "not_found" ? "not_found" : "failed" }
}

/* ------------------------------ identificação ------------------------------- */

export interface IdentifyOptions {
  /** Última tentativa explícita (ex.: falha do monitoramento); sem ela, vem das consultas. */
  lastAttempt?: TribunalAttempt
}

export function identifyTribunal(cnj: string, input: TribunalCheck[], identifiedAt: string, options: IdentifyOptions = {}): TribunalIdentification {
  const parts = parseCNJ(cnj)
  const origin = parts?.checkDigitsValid ? originTribunal(parts.digits) : undefined
  const checks = input.map(normalizeCheck)
  const base = {
    cnj: parts?.digits,
    origin: { acronym: origin?.acronym, name: origin?.name, segment: origin?.segment, source: "cnj" as const, covered: isCovered(origin?.acronym) },
    checks,
    identifiedAt: officeTime(identifiedAt) ?? identifiedAt,
    lastAttempt: options.lastAttempt ? { ...options.lastAttempt, at: officeTime(options.lastAttempt.at) ?? options.lastAttempt.at } : attemptOf(checks),
  }
  const status = (s: CurrentTribunalStatus, reasons: string[], extra: Partial<TribunalIdentification["current"]> = {}) => ({ status: s, reasons, ...extra })

  const fromOrigin = (): TribunalIdentification["inferred"] =>
    origin
      ? { acronym: origin.acronym, name: origin.name, basis: "cnj", note: "Deduzido do número CNJ: é o tribunal de origem e não indica onde o processo tramita hoje." }
      : undefined

  if (!parts || !parts.checkDigitsValid) {
    return {
      ...base,
      current: status("invalid_number", [
        parts ? "Número CNJ com dígito verificador inválido: o tribunal não foi identificado." : "Número CNJ incompleto: o tribunal não foi identificado.",
      ]),
    }
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
    if (!origin) {
      return {
        ...base,
        current: status("unknown_tribunal", [
          `O código do tribunal (${parts.segment}.${parts.tribunalCode}) não existe na numeração única: o tribunal não foi identificado.`,
          ...superiorNotes,
        ]),
      }
    }
    if (!base.origin.covered && !originCheck) {
      return {
        ...base,
        current: status("unsupported", [`Não há fonte consultável para o ${origin.acronym}: o tribunal atual não foi verificado.`, ...superiorNotes]),
        inferred: fromOrigin(),
      }
    }
    if (!originCheck || originCheck.status === "failed" || originCheck.status === "not_checked") {
      return {
        ...base,
        current: status("not_checked", ["Nenhuma consulta à fonte foi concluída: o tribunal atual não foi verificado.", ...superiorNotes]),
        inferred: fromOrigin(),
      }
    }
    return {
      ...base,
      current: status(
        "not_found",
        [
          `Nenhum registro do número na consulta ao ${originCheck.tribunal}. Pode ser atraso de indexação, segredo de justiça ou tramitação em outro tribunal — a ausência não prova onde o processo está.`,
          ...superiorNotes,
        ],
        { source: "datajud", dataset: originCheck.dataset, checkedAt: originCheck.checkedAt },
      ),
      inferred: fromOrigin(),
    }
  }

  /* Há registros: confere os critérios ------------------------------------- */
  const records = found
    .flatMap((c) =>
      c.records.map((r) => ({ ...r, indexTribunal: c.tribunal, check: c, effective: r.tribunal && !sameTribunal(r.tribunal, c.tribunal) ? r.tribunal : c.tribunal })),
    )
    .sort(newestFirst)
  const latest = records[0]
  const listed = records
    .map((r) => `${r.effective}${r.degree ? ` (${r.degree})` : ""}${day(r.updatedAt) ? ` — atualizado em ${day(r.updatedAt)}` : ""}`)
    .join("; ")

  // Critério 2: um tribunal só, igual ao do índice. Senão, divergência — sem escolher.
  const mismatched = records.filter((r) => r.tribunal && !sameTribunal(r.tribunal, r.indexTribunal))
  const tribunals = [...new Set(records.map((r) => canonical(r.effective)))]
  if (mismatched.length || tribunals.length > 1) {
    const candidates = tribunals.map((key) => {
      const group = records.filter((r) => canonical(r.effective) === key)
      const acronym = group[0].effective
      return {
        acronym,
        name: tribunalName(acronym),
        degrees: [...new Set(group.map((r) => r.degree).filter((d): d is string => !!d))],
        updatedAt: group[0].updatedAt,
        role: group[0].check.role,
      }
    })
    const reasons = [
      tribunals.length > 1
        ? `Há registros em mais de um tribunal: ${listed}. A fonte não permite dizer em qual deles o processo tramita agora.`
        : `Um registro encontrado na consulta ao ${mismatched[0].indexTribunal} informa outro tribunal (${mismatched[0].tribunal}).`,
      ...found.map(incompleteText).filter((t): t is string => !!t),
      ...superiorNotes,
    ]
    return {
      ...base,
      current: status("conflicting", reasons, { source: "datajud", checkedAt: latest.check.checkedAt }),
      candidates,
    }
  }

  const acronym = latest.indexTribunal
  const missing: string[] = []
  const notes: string[] = []
  // Critérios 3 a 7.
  if (!latest.tribunal) missing.push(`O registro encontrado na consulta ao ${latest.indexTribunal} não informa o tribunal.`)
  if (!latest.updatedAt) missing.push("O registro não tem data de atualização na fonte.")
  const withMovement = records.filter((r) => r.lastMovement).sort((a, b) => b.lastMovement!.occurredAt.localeCompare(a.lastMovement!.occurredAt))[0]
  if (!withMovement) missing.push("Os registros não trazem movimentações para conferir se os autos saíram do tribunal.")
  const signal = withMovement ? transferSignal(withMovement.lastMovement, { degree: withMovement.degree, tribunal: withMovement.effective }) : undefined
  if (signal?.blocks) missing.push(signal.text)
  else if (signal) notes.push(signal.text)
  for (const c of failed) missing.push(`A consulta ao ${c.tribunal} não respondeu: pode haver registro lá.`)
  for (const text of found.map(incompleteText)) if (text) missing.push(text)

  const degrees = [...new Set(records.map((r) => r.degree).filter(Boolean))]
  const units = [...new Set(records.map((r) => r.judicialUnit).filter(Boolean))]
  if (degrees.length > 1) notes.push(`Registros em mais de um grau (${degrees.join(", ")}): o grau atual não foi confirmado.`)
  const info = tribunalByAcronym(acronym)

  if (missing.length) {
    return {
      ...base,
      current: status("not_confirmed", [...missing, ...notes, ...superiorNotes], {
        source: "datajud",
        dataset: latest.dataset ?? latest.check.dataset,
        updatedAt: latest.updatedAt,
        checkedAt: latest.check.checkedAt,
      }),
      inferred: {
        acronym,
        name: tribunalName(acronym),
        basis: "registro_mais_recente",
        note: `Inferido dos registros encontrados na consulta ao ${acronym}; não confirmado.`,
      },
    }
  }

  return {
    ...base,
    current: status(
      "confirmed",
      [
        `O registro da fonte informa o tribunal ${acronym}${day(latest.updatedAt) ? `, atualizado em ${day(latest.updatedAt)}` : ""}.`,
        "A última movimentação não indica saída dos autos deste tribunal.",
        ...notes,
        ...superiorNotes,
      ],
      {
        acronym,
        name: info?.name ?? acronym,
        degree: degrees.length === 1 ? degrees[0] : undefined,
        judicialUnit: units.length === 1 && records.length === 1 ? units[0] : undefined,
        source: "datajud",
        dataset: latest.dataset ?? latest.check.dataset,
        updatedAt: latest.updatedAt,
        checkedAt: latest.check.checkedAt,
      },
    ),
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
        ? {
            name: last.name,
            code: last.code,
            occurredAt: last.occurredAt,
            description: last.description,
            complementKeys: last.complements?.map((c) => c.key).filter((k): k is string => !!k),
          }
        : undefined,
    },
  ]
}

const toEvidence = (r: ExternalRecord): TribunalRecordEvidence => ({
  tribunal: r.tribunal,
  degree: r.degree,
  judicialUnit: r.judicialUnit,
  updatedAt: r.updatedAt,
  dataset: r.dataset,
  movementCount: r.movementCount,
  lastMovement: r.lastMovement,
})

/** Consulta a um índice a partir de registros e cobertura devolvidos pela fonte. */
export function checkFromRecords(input: {
  tribunal: string
  role: TribunalCheck["role"]
  dataset?: string
  checkedAt: string
  records: ExternalRecord[]
  coverage?: ExternalCoverage
}): TribunalCheck {
  return {
    tribunal: input.tribunal,
    role: input.role,
    status: input.records.length ? "found" : "not_found",
    provider: "datajud",
    dataset: input.dataset,
    checkedAt: officeTime(input.checkedAt),
    coverage: input.coverage,
    records: input.records.map(toEvidence).map(normalizeRecord),
  }
}

/** Consulta ao tribunal de origem a partir da ficha que a fonte devolveu. */
export function originCheckFromSheet(sheet: ProcessSheet, checkedAt: string): TribunalCheck {
  const tribunal = tribunalOfDataset(sheet.source.dataset) ?? tribunalFor(sheet.cnj) ?? originAcronym(sheet.cnj) ?? "?"
  return {
    ...checkFromRecords({ tribunal, role: "origem", dataset: sheet.source.dataset ?? (isCovered(tribunal) ? datasetFor(tribunal) : undefined), checkedAt, records: sheetRecords(sheet), coverage: sheet.coverage }),
    status: "found",
  }
}

export interface FromSheetOptions {
  /** Identificação já guardada no processo: as consultas a outros índices continuam valendo. */
  previous?: TribunalIdentification
  /** Consultas trazidas de fora (ex.: as do relatório da Consulta processual que está sendo aplicado). */
  checks?: TribunalCheck[]
}

/**
 * Identificação a partir da ficha (importação, sincronização, "Atualizar processo").
 * Nunca descarta consultas guardadas a outros índices: a consulta de origem nova substitui
 * só a de origem antiga.
 */
export function identifyFromSheet(sheet: ProcessSheet, checkedAt: string, options: FromSheetOptions = {}): TribunalIdentification {
  const previous = options.previous && (!options.previous.cnj || options.previous.cnj === sheet.cnj) ? options.previous.checks : undefined
  const checks = mergeChecks(previous, [...(options.checks ?? []), originCheckFromSheet(sheet, checkedAt)])
  return identifyTribunal(sheet.cnj, checks, checkedAt)
}

/**
 * Consultas trazidas de um relatório só valem para o MESMO número: com outro número
 * (a pessoa trocou o CNJ no formulário), a evidência é descartada.
 */
export function checksForNumber(evidence: { cnj: string; checks: TribunalCheck[] } | undefined, cnj: string): TribunalCheck[] | undefined {
  const a = parseCNJ(evidence?.cnj ?? "")?.digits
  const b = parseCNJ(cnj)?.digits
  return evidence && a && a === b ? evidence.checks : undefined
}

type IdentifiableProcess = Pick<Process, "cnj" | "number" | "tribunal" | "tribunalIdentification"> & Partial<Pick<Process, "origin" | "source">>

/**
 * Identificação de um processo salvo. Sem evidência guardada:
 * - número inválido, código inexistente ou tribunal sem fonte: dito como tal;
 * - cadastro manual nunca consultado: `not_checked`;
 * - processo salvo antes desta verificação: `legacy` — o tribunal do cadastro continua
 *   como dado do escritório, nunca como "atual".
 */
export function tribunalIdentificationOf(process: IdentifiableProcess): TribunalIdentification | undefined {
  if (process.tribunalIdentification) return process.tribunalIdentification
  const digits = parseCNJ(process.cnj ?? process.number ?? "")?.digits
  if (!digits) return undefined
  const identification = identifyTribunal(digits, [], "")
  if (identification.current.status !== "not_checked") return identification
  const manualOnly = process.origin === "manual" && !process.source?.provider
  return {
    ...identification,
    current: manualOnly
      ? { status: "not_checked", reasons: ["Cadastro manual: o tribunal atual ainda não foi verificado na fonte."] }
      : {
          status: "legacy",
          reasons: [
            process.tribunal
              ? `Processo salvo antes da verificação do tribunal atual: o tribunal registrado (${process.tribunal}) não tem evidência de consulta guardada.`
              : "Processo salvo antes da verificação do tribunal atual: não há evidência de consulta guardada.",
          ],
        },
  }
}

/**
 * Registra uma tentativa de consulta sem apagar a evidência guardada (o monitoramento,
 * quando a fonte falha, limita ou não encontra o número). `undefined` sem número válido.
 */
export function withAttempt(process: IdentifiableProcess, attempt: TribunalAttempt): TribunalIdentification | undefined {
  const current = tribunalIdentificationOf(process)
  return current ? { ...current, lastAttempt: { ...attempt, at: officeTime(attempt.at) ?? attempt.at } } : undefined
}

/* --------------------------------- rótulos --------------------------------- */

/** Rótulos curtos da situação do tribunal atual. */
export const CURRENT_STATUS_LABEL: Record<CurrentTribunalStatus, string> = {
  confirmed: "Confirmado pela fonte",
  not_confirmed: "Não confirmado",
  conflicting: "Registros divergentes",
  not_found: "Não localizado na fonte",
  unsupported: "Sem fonte para este tribunal",
  unknown_tribunal: "Código de tribunal inexistente",
  invalid_number: "Número CNJ inválido",
  not_checked: "Não verificado",
  legacy: "Sem verificação registrada",
}

/** O que cada situação significa — usado no contexto da IA (fato, não instrução). */
export const CURRENT_STATUS_MEANING: Record<CurrentTribunalStatus, string> = {
  confirmed: "A fonte tem registro do processo neste tribunal e os critérios de evidência foram atendidos na data da consulta.",
  not_confirmed: "Há registro na fonte, mas a evidência não basta para dizer onde o processo tramita hoje.",
  conflicting: "Há registros em mais de um tribunal; a fonte não permite dizer em qual deles o processo tramita hoje.",
  not_found: "A fonte consultada não tem o número; isso não prova onde o processo está.",
  unsupported: "O tribunal de origem não tem fonte consultável; o tribunal atual não foi verificado.",
  unknown_tribunal: "O código de tribunal do número não existe na numeração única.",
  invalid_number: "O número CNJ é inválido; o tribunal não foi identificado.",
  not_checked: "Nenhuma consulta à fonte foi concluída; o tribunal atual não foi verificado.",
  legacy: "O processo foi salvo antes da verificação do tribunal atual; não há evidência de consulta guardada.",
}

export const ATTEMPT_LABEL: Record<TribunalAttempt["outcome"], string> = {
  found: "registro encontrado",
  not_found: "número não localizado",
  failed: "fonte sem resposta",
  rate_limited: "fonte limitou as consultas",
}

/** A última tentativa é posterior à evidência e não a revalidou? */
export function staleAttempt(id: TribunalIdentification): TribunalAttempt | undefined {
  const attempt = id.lastAttempt
  if (!attempt || attempt.outcome === "found") return undefined
  const evidenceAt = id.current.checkedAt ?? ""
  return attempt.at > evidenceAt ? attempt : undefined
}

/** "TJSP — Tribunal de Justiça do Estado de São Paulo" */
export const tribunalLabel = (acronym?: string, name?: string) => (acronym ? (name && name !== acronym ? `${acronym} — ${name}` : acronym) : undefined)

/* ----------------------------------- IA ------------------------------------ */

/**
 * Tribunal para o contexto da IA: origem, atual (com estado e significado), tribunais com
 * registro quando divergem e a última tentativa. Só fatos — a regra de como usá-los está
 * no prompt de sistema (regra do tribunal).
 */
export function describeTribunalForAI(id: TribunalIdentification | undefined) {
  if (!id) return undefined
  const { origin, current, inferred } = id
  const confirmed = current.status === "confirmed"
  const stale = staleAttempt(id)
  return {
    tribunal_de_origem: origin.acronym
      ? `${tribunalLabel(origin.acronym, origin.name)} (pelo número CNJ — indica onde o processo começou, não onde tramita hoje)`
      : "não identificado pelo número",
    tribunal_atual: {
      estado: current.status,
      situacao: CURRENT_STATUS_LABEL[current.status],
      significado: CURRENT_STATUS_MEANING[current.status],
      tribunal: confirmed ? tribunalLabel(current.acronym, current.name) : undefined,
      grau: confirmed ? current.degree : undefined,
      fonte: current.source === "datajud" ? "DataJud (CNJ), consulta pública" : undefined,
      indice_consultado: current.dataset,
      atualizado_na_fonte: current.updatedAt,
      consultado_em: current.checkedAt,
      motivos: current.reasons,
    },
    tribunais_com_registro:
      current.status === "conflicting"
        ? id.candidates?.map((c) => ({
            tribunal: tribunalLabel(c.acronym, c.name),
            graus: c.degrees,
            atualizado_na_fonte: c.updatedAt,
            consulta: c.role === "origem" ? "tribunal de origem" : "tribunal superior (complementar)",
          }))
        : undefined,
    tribunal_inferido:
      !confirmed && current.status !== "conflicting" && inferred
        ? { tribunal: tribunalLabel(inferred.acronym, inferred.name), observacao: `${inferred.note} É uma inferência.` }
        : undefined,
    ultima_tentativa: id.lastAttempt ? { em: id.lastAttempt.at, resultado: ATTEMPT_LABEL[id.lastAttempt.outcome], tribunal: id.lastAttempt.tribunal } : undefined,
    limitacao: !confirmed
      ? "O tribunal atual não está confirmado pela fonte."
      : stale
        ? `A confirmação é de ${current.checkedAt}; a tentativa de ${stale.at} teve como resultado: ${ATTEMPT_LABEL[stale.outcome]} — a confirmação não foi revalidada.`
        : undefined,
  }
}
