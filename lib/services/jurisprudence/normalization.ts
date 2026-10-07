/**
 * Normalização de dados vindos de fontes externas. Tudo o que chega da fonte é
 * tratado como dado não confiável: vira texto puro (sem HTML), sem caracteres de
 * controle, com tamanho máximo, datas validadas e URLs só https de hosts conhecidos.
 * Campo ausente continua ausente (`null`) — nada é completado por suposição.
 */

import { createHash } from "node:crypto"
import type { NormalizedDecision } from "./types"

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }

/** Texto puro, sem HTML nem controle, espaços normalizados e no máximo `max` caracteres. */
export function cleanText(value: unknown, max = 2000): string | null {
  if (value === null || value === undefined) return null
  let text = typeof value === "string" ? value : typeof value === "number" ? String(value) : Array.isArray(value) ? value.filter((v) => typeof v === "string").join("\n") : ""
  if (!text) return null
  text = text
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const lower = entity.toLowerCase()
      if (ENTITIES[lower]) return ENTITIES[lower]
      const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : lower.startsWith("#") ? parseInt(lower.slice(1), 10) : NaN
      return Number.isFinite(code) && code > 31 && code < 0x10ffff ? String.fromCodePoint(code) : match
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** Lista de textos (array, ou um texto com uma entrada por linha). */
export function cleanList(value: unknown, maxItems = 40, maxLength = 400): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n+/) : []
  const out: string[] = []
  for (const item of items) {
    const text = cleanText(item, maxLength)
    if (text && !out.includes(text)) out.push(text)
    if (out.length >= maxItems) break
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, "0")

/** Data real em `AAAA-MM-DD`, ou `null`. Aceita `AAAAMMDD`, `DD/MM/AAAA` (inclusive dentro de um texto) e ISO. */
export function parseDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const text = String(value).trim()
  let y: number, m: number, d: number
  let match = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else if ((match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else if ((match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else return null
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1) return null
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > last) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

const letters = (text: string) => text.replace(/[^A-Za-zÀ-ÿ]/g, "")

/**
 * "Assunto": a verbetação do início da ementa — os trechos em MAIÚSCULAS que o
 * tribunal escreve antes do texto ("PROCESSUAL CIVIL. CONSUMIDOR. INSCRIÇÃO INDEVIDA…").
 * Sem verbetação, `null`.
 */
export function ementaSubject(ementa: string | null, max = 400): string | null {
  if (!ementa) return null
  const parts: string[] = []
  for (const raw of ementa.replace(/\n+/g, " ").split(/(?<=[.;])\s+/)) {
    const segment = raw.trim().replace(/[.;]$/, "")
    const only = letters(segment)
    if (only.length < 3) {
      if (parts.length) break
      continue
    }
    const upper = only.replace(/[^A-ZÀ-Þ]/g, "").length
    if (upper / only.length < 0.85) break
    parts.push(segment)
    if (parts.join(". ").length >= max) break
  }
  return parts.length ? cleanText(parts.join(". "), max) : null
}

/** Sem acento e em maiúsculas — para comparar nomes de órgãos. */
export const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()

/** URL só se for https e de um host permitido. */
export function safeUrl(value: unknown, hosts: readonly string[]): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" && hosts.includes(url.hostname) ? url.toString() : null
  } catch {
    return null
  }
}

/** Hash do conteúdo (sem referências de arquivo): igual = nada a atualizar. */
export function contentHash(decision: Omit<NormalizedDecision, "content_hash" | "raw_reference">): string {
  const ordered = Object.keys(decision)
    .sort()
    .map((key) => [key, decision[key as keyof typeof decision]])
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex")
}

/** Primeiro valor presente entre as chaves (as fontes variam o nome dos campos). */
export function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== "") return value
  }
  return undefined
}
