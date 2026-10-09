/**
 * Menções a magistrados no TEXTO de comunicações oficiais (DJEN).
 *
 * Regras (deliberadamente estritas):
 * - Só conta um nome com o papel escrito ao lado, no próprio texto: "Relator(a): Des.
 *   Fulano", "FULANO DE TAL, Juiz(a) de Direito", "Fulano\nJuíza Federal".
 * - "Assinado eletronicamente por X" sem papel de magistrado NÃO conta: quem assina
 *   intimações costuma ser servidor da secretaria.
 * - O nome da vara/órgão nunca vira nome de juiz.
 * - O resultado é uma MENÇÃO datada, com trecho e link — nunca "o juiz responsável
 *   atual". A tela diz isso.
 */

import type { MagistrateMention, MagistrateRole, SourceId } from "./types"

/** Literal sem diferença de maiúsculas (só nos rótulos de papel — os nomes exigem inicial maiúscula). */
const ci = (literal: string) => literal.replace(/\p{L}/gu, (ch) => `[${ch.toLocaleLowerCase("pt-BR")}${ch.toLocaleUpperCase("pt-BR")}]`)
const FEM = `(?:${ci("a")}|\\(${ci("a")}\\))?`

const JUIZ = `${ci("ju")}[iíIÍ]${ci("z")}${FEM}`
const JUIZ_KIND = `[ \\t]+(?:${ci("de")}[ \\t]+${ci("direito")}|${ci("federal")}|${ci("do")}[ \\t]+${ci("trabalho")})`
const SUBSTITUTE = `(?:[ \\t]+${ci("substitut")}[oaOA](?:\\(${ci("a")}\\))?)?`
const RELATOR = `${ci("relator")}${FEM}`
const DESEMBARGADOR = `${ci("desembargador")}${FEM}(?:[ \\t]+${ci("federal")})?`
const MINISTRO = `${ci("ministr")}[oaOA](?:\\(${ci("a")}\\))?`
const HONORIFIC = `(?:(?:${ci("des")}(?:${ci("embargador")}${FEM})?|${ci("min")}(?:${ci("istr")}[oaOA](?:\\(${ci("a")}\\))?)?|${JUIZ}|${ci("dr")}${ci("a")}?)\\.?[ \\t]+)?`

const WORD = "[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+"
/** Palavras com inicial maiúscula, NA MESMA LINHA ("de", "da", "dos"… no meio). */
const NAME = `${WORD}(?:[ \\t]+(?:(?:d[aeo]s?|e)[ \\t]+)?${WORD}){1,9}`

/** "FULANO DE TAL, Juiz de Direito" · "Fulano\nJuíza Federal" · "Fulano – Desembargador Relator". */
const ROLE_AFTER = new RegExp(
  `(${NAME})[ \\t]*(?:,|\\n|–|-)[ \\t]*(${JUIZ}${JUIZ_KIND}${SUBSTITUTE}|${DESEMBARGADOR}(?:[ \\t]+${RELATOR})?|${MINISTRO}(?:[ \\t]+${RELATOR})?)`,
  "g",
)
/** "Relator(a): Des. Fulano" · "Juíza de Direito: Fulana". */
const ROLE_BEFORE = new RegExp(`(${RELATOR}|${JUIZ}${JUIZ_KIND}|${DESEMBARGADOR}(?:[ \\t]+${RELATOR})?)[ \\t]*[:–-][ \\t]*${HONORIFIC}(${NAME})`, "g")

/** Palavras que denunciam que o "nome" é, na verdade, um órgão, um cargo ou um texto. */
const NOT_A_NAME =
  /(^|[\s(])(poder|judici[aá]rio|justi[cç]a|tribunal|vara|comarca|ju[ií]zo|secretaria|estado|rep[uú]blica|documento|assinad|eletr[oô]nic|processo|intima|cita[cç]|senten[cç]a|despacho|decis[aã]o|turma|c[aâ]mara|se[cç][aã]o|gabinete|f[oó]rum|central|cart[oó]rio|minist[eé]rio|p[uú]blico|defensoria|federal|direito|trabalho|relator|desembargador|ju[ií]z|ministr|por|em|data|autos|n[uú]cleo|unidade)/i

const LOWER = new Set(["da", "de", "do", "das", "dos", "e"])

/** "MARIA DE SOUZA" → "Maria de Souza". */
export function nameCase(name: string) {
  return name
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((word, i) => (i > 0 && LOWER.has(word) ? word : word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1)))
    .join(" ")
}

function roleOf(label: string): MagistrateRole {
  const l = label.toLowerCase()
  if (l.includes("relator")) return "relator"
  if (l.startsWith("desembargador")) return "desembargador"
  if (l.startsWith("ministr")) return "ministro"
  return "juiz"
}

const ROLE_LABEL: Record<MagistrateRole, string> = {
  relator: "Relator(a)",
  juiz: "Juiz(a)",
  desembargador: "Desembargador(a)",
  ministro: "Ministro(a)",
}

function cleanRoleLabel(label: string) {
  const role = roleOf(label)
  const text = label.replace(/\s+/g, " ").trim()
  if (role === "juiz") {
    const kind = /de direito/i.test(text) ? " de Direito" : /federal/i.test(text) ? " Federal" : /do trabalho/i.test(text) ? " do Trabalho" : ""
    return `Juiz(a)${kind}${/substitut/i.test(text) ? " Substituto(a)" : ""}`
  }
  if (role === "relator" && /desembargador/i.test(text)) return "Desembargador(a) Relator(a)"
  if (role === "relator" && /ministr/i.test(text)) return "Ministro(a) Relator(a)"
  return ROLE_LABEL[role]
}

function validName(name: string) {
  const words = name.split(" ").filter((w) => !LOWER.has(w.toLowerCase()))
  return words.length >= 2 && words.length <= 7 && name.length >= 6 && name.length <= 80 && !NOT_A_NAME.test(name)
}

const HONORIFIC_WORD = /^(dr|dra|des|min|exmo|exma|sr|sra)\.?$/i

/**
 * O trecho capturado pode ter palavras antes ou depois do nome ("Documento Assinado Por
 * MARIA SOUZA", "SANTOS. Intimação"): o nome termina no fim de frase e as palavras que
 * não são nome são descartadas, mantendo o trecho válido mais longo.
 */
function trimToName(raw: string): string | undefined {
  let words = raw.replace(/\s+/g, " ").trim().split(" ")
  // Fim de frase ("SANTOS.") encerra o nome; iniciais ("A.") e abreviações curtas não.
  const stop = words.findIndex((w) => /\p{L}{3,}\.$/u.test(w) && !HONORIFIC_WORD.test(w))
  if (stop >= 0) words = words.slice(0, stop + 1)
  words = words.map((w, i) => (i === words.length - 1 ? w.replace(/[.,;:]+$/, "") : w))
  for (let from = 0; from < words.length - 1; from += 1) {
    if (LOWER.has(words[from].toLowerCase()) || HONORIFIC_WORD.test(words[from])) continue
    for (let to = words.length; to >= from + 2; to -= 1) {
      if (LOWER.has(words[to - 1].toLowerCase())) continue
      const candidate = words.slice(from, to).join(" ")
      if (validName(candidate)) return candidate
    }
  }
  return undefined
}

function excerptAround(text: string, index: number, length: number) {
  const start = Math.max(0, index - 60)
  const end = Math.min(text.length, index + length + 60)
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`
}

export interface MentionSource {
  text: string
  date?: string
  url?: string
  source: SourceId
}

/** Menções explícitas em uma comunicação. */
export function mentionsIn(input: MentionSource): MagistrateMention[] {
  const found: MagistrateMention[] = []
  const push = (rawName: string, rawRole: string, index: number, length: number) => {
    const name = trimToName(rawName)
    if (!name) return
    const role = roleOf(rawRole)
    found.push({
      name: nameCase(name),
      role,
      roleLabel: cleanRoleLabel(rawRole),
      date: input.date,
      source: input.source,
      url: input.url,
      excerpt: excerptAround(input.text, index, length),
    })
  }
  for (const match of input.text.matchAll(ROLE_AFTER)) push(match[1], match[2], match.index ?? 0, match[0].length)
  for (const match of input.text.matchAll(ROLE_BEFORE)) push(match[2], match[1], match.index ?? 0, match[0].length)
  return found
}

/** Junta as menções de várias comunicações: uma por nome + papel, a mais recente. */
export function collectMentions(inputs: MentionSource[]): MagistrateMention[] {
  const byKey = new Map<string, MagistrateMention>()
  for (const input of inputs) {
    for (const mention of mentionsIn(input)) {
      const key = `${mention.name.toLocaleLowerCase("pt-BR")}|${mention.role}`
      const current = byKey.get(key)
      if (!current || (mention.date ?? "") > (current.date ?? "")) byKey.set(key, mention)
    }
  }
  return [...byKey.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.name.localeCompare(b.name))
}
