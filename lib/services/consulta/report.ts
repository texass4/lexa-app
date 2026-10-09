/**
 * Montagem do relatório da consulta processual — lógica pura (sem rede, sem banco).
 *
 * Recebe o que cada fonte trouxe e organiza em seções. Regras:
 * - cada valor leva a fonte, a hora da consulta e onde verificar;
 * - fontes que discordam ficam lado a lado (conflito), sem escolha automática;
 * - o cadastro do escritório é mostrado e comparado, nunca alterado aqui;
 * - o que nenhuma fonte trouxe entra em "Informações indisponíveis".
 */

import { formatCNJ } from "@/lib/processos/cnj"
import { processTitle } from "@/lib/processos/label"
import { tribunalInfo } from "@/lib/processos/tribunals"
import { degreeLabel } from "@/lib/services/processos/labels"
import type { Communication } from "@/lib/integrations/legal/djen/mapper"
import type { ProcessSheet } from "@/lib/services/processos/sheet"
import type { Process } from "@/types"
import { collectMentions } from "./magistrate"
import {
  NOT_AVAILABLE,
  type EnrichmentReport,
  type FieldKey,
  type OfficeComparison,
  type ReportConflict,
  type ReportField,
  type ReportJurisprudence,
  type ReportLawyer,
  type ReportLink,
  type ReportParty,
  type ReportValue,
  type SourceStatus,
} from "./types"

/** Documentação oficial da API pública do DataJud (CNJ). */
export const DATAJUD_DOCS_URL = "https://datajud-wiki.cnj.jus.br/api-publica/"
/** Página pública das comunicações processuais (DJEN). */
export const DJEN_PUBLIC_URL = "https://comunica.pje.jus.br/"

/** Teto do relatório guardado (o resto continua na fonte). */
export const LIMITS = { movements: 200, communications: 50, excerpt: 280 } as const

export interface PrimaryData {
  sheet: ProcessSheet
  /** ISO (UTC) de quando a fonte foi consultada. */
  checkedAt: string
}

export interface CommunicationsData {
  items: Communication[]
  total: number
  checkedAt: string
}

export interface JurisprudenceData {
  items: ReportJurisprudence[]
  total: number
  basis: string[]
  message?: string
}

export interface AssembleInput {
  cnj: string
  now: Date
  process?: Process | null
  clientName?: string
  primary?: PrimaryData | null
  primaryStatus: SourceStatus
  communications?: CommunicationsData | null
  communicationsStatus: SourceStatus
  jurisprudence?: JurisprudenceData | null
  /** Fontes externas puladas porque o processo está em segredo de justiça. */
  secretSkipped?: boolean
}

/* -------------------------------- helpers -------------------------------- */

/** Comparação tolerante: sem acento, caixa, pontuação nem "ª/º". */
export function comparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ªº°]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Dois valores dizem a mesma coisa? (um contido no outro também conta: "1 vara civel" ⊂ "1 vara civel da capital"). */
export function sameValue(a: string, b: string) {
  const x = comparable(a)
  const y = comparable(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

const filled = (value?: string | null) => {
  const v = value?.replace(/\s+/g, " ").trim()
  // Marcadores do cadastro que não são informação.
  return v && !/^(a definir|não informado|nao informado)$/i.test(v) ? v : undefined
}

const formatMoney = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const POLE_LABEL: Record<string, string> = { A: "Polo ativo", P: "Polo passivo", ATIVO: "Polo ativo", PASSIVO: "Polo passivo", AT: "Polo ativo", PA: "Polo passivo" }
const poleLabel = (pole?: string) => (pole ? (POLE_LABEL[pole.toUpperCase()] ?? pole) : undefined)

/** Campo com valores de várias fontes; conflito quando discordam. */
function field(key: FieldKey, label: string, values: (ReportValue | undefined)[]): ReportField {
  const list = values.filter((v): v is ReportValue => !!v && !!v.value)
  const distinct: ReportValue[] = []
  for (const v of list) if (!distinct.some((d) => sameValue(d.value, v.value))) distinct.push(v)
  return { key, label, values: list, conflict: distinct.length > 1 }
}

/* --------------------------------- seções -------------------------------- */

function buildFields(input: AssembleInput, verifyUrl?: string): ReportField[] {
  const { primary, process, communications } = input
  const s = primary?.sheet
  const at = primary?.checkedAt
  const dj = (value?: string | number | null, note?: string): ReportValue | undefined =>
    value === undefined || value === null || value === "" ? undefined : { value: String(value), source: "datajud", checkedAt: at, url: verifyUrl, note }
  const office = (value?: string | null, note?: string): ReportValue | undefined =>
    filled(value) && process ? { value: filled(value)!, source: "cadastro", url: `/processos/${process.id}`, note } : undefined
  const latest = communications?.items[0]
  const djen = (value?: string): ReportValue | undefined =>
    value ? { value, source: "djen", checkedAt: communications?.checkedAt, url: latest?.url, note: latest?.date ? `comunicação de ${latest.date.split("-").reverse().join("/")}` : undefined } : undefined
  const fromComms = (pick: (c: Communication) => string | undefined) => {
    const c = communications?.items.find((item) => !!pick(item))
    return c ? pick(c) : undefined
  }
  const tribunal = s?.tribunal ? tribunalInfo(input.cnj, s.tribunal) : undefined

  const secrecy =
    s?.secrecyLevel !== undefined ? (s.secrecyLevel === 0 ? "Público (nível 0)" : `Sigilo nível ${s.secrecyLevel}`) : undefined

  return [
    field("numero", "Número CNJ", [dj(s?.number), !s && process?.number ? office(process.number) : undefined]),
    field("tribunal", "Tribunal", [
      dj(tribunal ? `${tribunal.acronym} — ${tribunal.name}` : s?.tribunal),
      office(process?.tribunal),
      djen(fromComms((c) => c.tribunal)),
    ]),
    field("grau", "Grau", [dj(degreeLabel(s?.degree)), office(degreeLabel(process?.degree))]),
    field("sistema", "Sistema", [dj(s?.system)]),
    field("formato", "Formato", [dj(s?.format)]),
    field("classe", "Classe", [dj(s?.className), djen(fromComms((c) => c.className)), office(process?.className)]),
    field("assuntos", "Assuntos", [dj((s?.subjects?.length ? s.subjects : s?.subject ? [s.subject] : []).join(" · ") || undefined)]),
    field("orgao_julgador", "Órgão julgador", [
      dj(s?.judicialUnit),
      djen(fromComms((c) => c.unit)),
      office(process?.judicialUnit ?? process?.court),
    ]),
    field("codigo_orgao", "Código do órgão julgador (CNJ)", [dj(s?.judicialUnitCode)]),
    field("municipio_ibge", "Município do órgão (código IBGE)", [dj(s?.judicialUnitMunicipality)]),
    field("data_ajuizamento", "Data de ajuizamento", [dj(s?.filedAt?.split("-").reverse().join("/"))]),
    field("situacao", "Situação processual", [dj(s?.sourceStatus)]),
    field("valor_causa", "Valor da causa", [process && process.claimValue > 0 ? office(formatMoney(process.claimValue), "informado pelo escritório") : undefined]),
    field("prioridades", "Prioridades e características", []),
    field("sigilo", "Nível de sigilo", [dj(secrecy), process?.secret ? office("Segredo de justiça", "informado pelo escritório") : undefined]),
    field("ultima_atualizacao", "Última atualização na fonte", [dj(s?.updatedAt?.replace("T", " ").slice(0, 16).replace(/^(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1"))]),
  ]
}

function buildParties(input: AssembleInput, hidden: boolean) {
  const parties: ReportParty[] = []
  const lawyers: ReportLawyer[] = []
  const at = input.primary?.checkedAt
  if (!hidden) {
    const sheet = input.primary?.sheet
    for (const [pole, list] of [
      ["Polo ativo", sheet?.parties.active ?? []],
      ["Polo passivo", sheet?.parties.passive ?? []],
      [undefined, sheet?.parties.others ?? []],
    ] as const) {
      for (const p of list) parties.push({ name: p.name, pole, role: p.role, source: "datajud", date: at?.slice(0, 10) })
    }
    // Mais recente primeiro: a primeira ocorrência de cada nome é a mais nova.
    for (const c of input.communications?.items ?? []) {
      for (const r of c.recipients) {
        const pole = poleLabel(r.pole)
        if (!parties.some((p) => comparable(p.name) === comparable(r.name) && p.pole === pole)) {
          parties.push({ name: r.name, pole, source: "djen", date: c.date, url: c.url })
        }
      }
      for (const l of c.lawyers) {
        if (!lawyers.some((x) => comparable(x.name) === comparable(l.name) && x.oab === l.oab)) {
          lawyers.push({ name: l.name, oab: l.oab, source: "djen", date: c.date, url: c.url })
        }
      }
    }
  }
  const note = hidden
    ? "Partes não exibidas: o processo tem sigilo ou segredo de justiça."
    : input.communicationsStatus === "ok"
      ? "Partes e advogados como publicados em comunicações oficiais (DJEN). A consulta pública do DataJud não informa partes."
      : "A consulta pública do DataJud não informa partes e representantes; a fonte de comunicações oficiais não trouxe dados nesta consulta."
  return { items: parties, lawyers, note }
}

function buildMagistrate(input: AssembleInput, fields: ReportField[], verifyUrl?: string) {
  const unit = fields.find((f) => f.key === "orgao_julgador")?.values[0]
  const tribunal = fields.find((f) => f.key === "tribunal")?.values[0]
  const unitCode = fields.find((f) => f.key === "codigo_orgao")?.values[0]?.value
  const mentions = collectMentions((input.communications?.items ?? []).map((c) => ({ text: c.text, date: c.date, url: c.url, source: "djen" as const })))
  const note = mentions.length
    ? "Nomes citados, com o papel escrito no próprio texto, em comunicações oficiais publicadas. Cada menção mostra quem atuou naquele ato e naquela data — não confirma quem é o magistrado responsável hoje. Confira no site do tribunal."
    : "Magistrado não identificado. A fonte processual principal (DataJud) não informa o magistrado, e o nome do órgão julgador não basta para identificar o juiz responsável."
  return { unit, unitCode, tribunal, mentions, note, verifyUrl }
}

function buildConflicts(fields: ReportField[]): ReportConflict[] {
  return fields
    .filter((f) => f.conflict)
    .map((f) => ({ label: f.label, values: f.values, note: "As fontes informam valores diferentes. Nada foi alterado automaticamente: confira na fonte oficial." }))
}

function buildOffice(input: AssembleInput): OfficeComparison | undefined {
  const { process, primary } = input
  if (!process) return undefined
  const s = primary?.sheet
  const manual = process.origin === "manual"
  const row = (label: string, office?: string | null, source?: string) => {
    const o = filled(office)
    if (!o) return null
    return { label, office: o, source: source || undefined, differs: !!source && !sameValue(o, source) }
  }
  const fields = [
    row("Tribunal", process.tribunal, s?.tribunal),
    row("Grau", degreeLabel(process.degree), degreeLabel(s?.degree)),
    row("Órgão julgador", process.judicialUnit ?? process.court, s?.judicialUnit),
    row("Classe", process.className, s?.className),
    row("Tipo de ação", process.type),
    row("Valor da causa", process.claimValue > 0 ? formatMoney(process.claimValue) : undefined),
  ].filter((f): f is NonNullable<typeof f> => !!f)
  const canApply = !process.secret && input.primaryStatus === "ok" && !!primary
  return {
    processId: process.id,
    label: processTitle(process, input.clientName),
    secret: !!process.secret,
    manual,
    fields,
    canApply,
    applyNote: process.secret
      ? "Processo em segredo de justiça: o cadastro do escritório é mantido como está e não recebe dados da consulta pública."
      : !canApply
        ? "A fonte principal não trouxe dados nesta consulta: não há o que atualizar."
        : manual
          ? "Atualizar acrescenta as movimentações novas e completa só os campos vazios. O que o escritório preencheu à mão é mantido."
          : "Atualizar acrescenta as movimentações novas e os dados públicos da fonte. Tipo de ação, responsável, valor da causa e observações do escritório não mudam.",
  }
}

/* ------------------------------- relatório ------------------------------- */

export function assembleReport(input: AssembleInput): EnrichmentReport {
  const { cnj, primary, process, communications } = input
  const sheet = primary?.sheet
  const tribunal = tribunalInfo(cnj, sheet?.tribunal)
  const verifyUrl = tribunal?.site
  const fields = buildFields(input, verifyUrl)
  const hidden = !!process?.secret || (sheet?.secrecyLevel ?? 0) > 0
  const parties = buildParties(input, hidden)
  const magistrate = buildMagistrate(input, fields, verifyUrl)

  const movementsAll = sheet?.movements ?? []
  const movements = movementsAll.slice(0, LIMITS.movements).map((m) => ({
    at: m.occurredAt,
    title: m.name,
    description: m.description,
    code: m.code,
    unit: m.judicialUnit?.name,
  }))

  const commsAll = [...(communications?.items ?? [])].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
  const comms = commsAll.slice(0, LIMITS.communications).map((c) => ({
    date: c.date,
    type: c.type,
    documentType: c.documentType,
    unit: c.unit,
    className: c.className,
    url: c.url,
    excerpt: c.text ? (c.text.length > LIMITS.excerpt ? `${c.text.slice(0, LIMITS.excerpt).trim()}…` : c.text) : undefined,
  }))

  const links: ReportLink[] = []
  if (tribunal) {
    links.push({
      label: `Site oficial do ${tribunal.acronym}`,
      url: tribunal.site,
      source: "tribunal",
      note: "Consulta processual pública no site do tribunal (pode pedir CAPTCHA; a Íntegra não acessa por você).",
    })
  }
  if (input.primaryStatus !== "skipped") links.push({ label: "API Pública do DataJud — documentação (CNJ)", url: DATAJUD_DOCS_URL, source: "datajud" })
  if (input.communicationsStatus === "ok") links.push({ label: "Comunicações processuais — consulta pública (DJEN/CNJ)", url: DJEN_PUBLIC_URL, source: "djen" })
  if (process) links.push({ label: "Processo no cadastro do escritório", url: `/processos/${process.id}`, source: "cadastro" })

  const unavailable = fields
    .filter((f) => f.key !== "numero" && f.values.length === 0)
    .map((f) => ({
      label: f.label,
      reason: f.key === "prioridades" ? `${NOT_AVAILABLE} (a API pública do DataJud não informa prioridades)` : NOT_AVAILABLE,
    }))
  if (!parties.items.length) unavailable.push({ label: "Partes", reason: hidden ? "Não exibidas: processo com sigilo" : NOT_AVAILABLE })
  if (!parties.lawyers.length) unavailable.push({ label: "Representantes (advogados)", reason: hidden ? "Não exibidos: processo com sigilo" : NOT_AVAILABLE })
  if (!magistrate.mentions.length) unavailable.push({ label: "Magistrado", reason: `${NOT_AVAILABLE} — o nome do órgão julgador não identifica o juiz` })
  unavailable.push({ label: "Perfil institucional do magistrado", reason: "Não disponível nas fontes integradas — consulte o site oficial do tribunal" })
  if (!movementsAll.length) unavailable.push({ label: "Movimentações", reason: NOT_AVAILABLE })

  const notices: string[] = []
  if (input.secretSkipped) {
    notices.push("Processo em segredo de justiça: as fontes públicas não foram consultadas e o cadastro do escritório foi preservado como está.")
  }
  if (input.primaryStatus === "not_found") notices.push("A fonte processual principal (DataJud) não tem este número. Pode ser atraso de indexação, segredo de justiça ou número incorreto.")
  if (["unavailable", "timeout", "rate_limited", "error"].includes(input.primaryStatus)) {
    notices.push("A fonte processual principal não respondeu nesta consulta. O relatório mostra só o que as demais fontes trouxeram — tente de novo mais tarde.")
  }
  if ((sheet?.secrecyLevel ?? 0) > 0) notices.push(`A fonte informa sigilo (nível ${sheet!.secrecyLevel}): parte das informações não é pública e não foi exibida.`)

  const title = process
    ? processTitle(process, input.clientName)
    : [sheet?.className, sheet?.subjects?.[0] ?? sheet?.subject].filter(Boolean).join(" — ") || `Processo ${formatCNJ(cnj)}`

  return {
    cnj,
    number: formatCNJ(cnj),
    generatedAt: input.now.toISOString(),
    summary: {
      title,
      tribunal: tribunal ? `${tribunal.acronym} — ${tribunal.name}` : undefined,
      unit: magistrate.unit?.value,
      situation: sheet?.sourceStatus,
      lastMovement: sheet?.lastMovement ? { title: sheet.lastMovement.name, at: sheet.lastMovement.occurredAt } : undefined,
      movementsTotal: movementsAll.length,
      notFound: input.primaryStatus === "not_found",
    },
    fields,
    parties,
    magistrate,
    movements: { items: movements, total: movementsAll.length, truncated: movementsAll.length > movements.length },
    communications: { items: comms, total: communications?.total ?? 0, truncated: (communications?.total ?? 0) > comms.length },
    jurisprudence: input.jurisprudence ?? { items: [], total: 0, basis: [] },
    links,
    conflicts: buildConflicts(fields),
    office: buildOffice(input),
    unavailable,
    notices,
  }
}

/** Rótulos do que foi encontrado / do que faltou (para o registro da execução). */
export function fieldSummary(report: EnrichmentReport) {
  const found = report.fields.filter((f) => f.values.length).map((f) => f.label)
  if (report.parties.items.length) found.push("Partes")
  if (report.parties.lawyers.length) found.push("Representantes (advogados)")
  if (report.magistrate.mentions.length) found.push("Magistrado (menção em comunicação)")
  if (report.movements.total) found.push("Movimentações")
  if (report.communications.items.length) found.push("Comunicações publicadas")
  if (report.jurisprudence.items.length) found.push("Jurisprudência relacionada")
  return { found, missing: report.unavailable.map((u) => u.label) }
}
