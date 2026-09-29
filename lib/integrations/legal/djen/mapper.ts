/**
 * Item do DJEN → comunicação no modelo da Íntegra. O teor é guardado exatamente como
 * veio (pode ter HTML); a tela mostra uma versão só-texto, nunca o HTML.
 */

import type { DjenItem } from "./client"

export const DJEN_CERTIDAO_URL = (hash: string) => `https://comunicaapi.pje.jus.br/api/v1/comunicacao/${encodeURIComponent(hash)}/certidao`

export interface Communication {
  externalId: string
  hash?: string
  /** `YYYY-MM-DD` */
  availableAt: string
  /** 20 dígitos, quando a fonte informa. */
  cnj?: string
  processNumber?: string
  tribunal?: string
  orgao?: string
  tipoComunicacao?: string
  tipoDocumento?: string
  classe?: string
  meio?: string
  /** Teor integral, como a fonte publicou. */
  content: string
  /** Documento na fonte (quando houver). */
  documentUrl?: string
  /** Certidão oficial da publicação no DJEN. */
  officialUrl?: string
  parties: { name: string; pole?: string }[]
  lawyers: { name: string; number: string; uf: string }[]
  /** Comunicação cancelada na fonte. */
  cancelled: boolean
  raw: DjenItem
}

/** `2026-09-28`, `2026-09-28T00:00:00` ou `28/09/2026` → `2026-09-28`. */
export function sourceDate(item: Pick<DjenItem, "data_disponibilizacao" | "datadisponibilizacao">): string | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(item.data_disponibilizacao ?? "")
  if (iso) return iso[0]
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(item.datadisponibilizacao ?? item.data_disponibilizacao ?? "")
  return br ? `${br[3]}-${br[2]}-${br[1]}` : undefined
}

const clean = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined)

/** `null` quando falta o essencial (id, data ou teor): não dá para guardar com segurança. */
export function mapCommunication(item: DjenItem): Communication | null {
  const availableAt = sourceDate(item)
  const content = typeof item.texto === "string" ? item.texto : ""
  if (item.id === undefined || item.id === null || !availableAt || !content.trim()) return null
  const cnj = (item.numero_processo ?? item.numeroprocessocommascara ?? "").replace(/\D/g, "")
  const hash = clean(item.hash)
  return {
    externalId: String(item.id),
    hash,
    availableAt,
    cnj: cnj.length === 20 ? cnj : undefined,
    processNumber: clean(item.numeroprocessocommascara),
    tribunal: clean(item.siglaTribunal),
    orgao: clean(item.nomeOrgao),
    tipoComunicacao: clean(item.tipoComunicacao),
    tipoDocumento: clean(item.tipoDocumento),
    classe: clean(item.nomeClasse),
    meio: clean(item.meiocompleto) ?? clean(item.meio),
    content,
    documentUrl: clean(item.link),
    officialUrl: hash ? DJEN_CERTIDAO_URL(hash) : undefined,
    parties: (item.destinatarios ?? []).filter((d) => clean(d?.nome)).map((d) => ({ name: d.nome!.trim(), pole: clean(d.polo) })),
    lawyers: (item.destinatarioadvogados ?? [])
      .map((d) => d?.advogado)
      .filter((a): a is NonNullable<typeof a> => !!a && !!clean(a.nome))
      .map((a) => ({ name: a.nome!.trim(), number: String(a.numero_oab ?? "").replace(/\D/g, ""), uf: String(a.uf_oab ?? "").toUpperCase() })),
    cancelled: item.ativo === false || /cancel/i.test(item.status ?? ""),
    raw: item,
  }
}

/** Teor para leitura: sem tags HTML (o original fica guardado intacto). */
export function readableContent(content: string) {
  return content
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h\d)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
