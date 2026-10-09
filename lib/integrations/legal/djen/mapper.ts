/**
 * Item do DJEN → comunicação no modelo da Íntegra. Todo detalhe do formato da fonte
 * morre aqui. Nada é inventado: campo ausente fica ausente.
 */

import type { DjenItem } from "./client"

/** Certidão oficial da publicação no DJEN (página da própria fonte). */
export const djenCertidaoUrl = (hash: string) => `https://comunicaapi.pje.jus.br/api/v1/comunicacao/${encodeURIComponent(hash)}/certidao`

export interface Communication {
  externalId: string
  /** `YYYY-MM-DD` da disponibilização. */
  date?: string
  /** 20 dígitos, quando a fonte informa. */
  cnj?: string
  tribunal?: string
  unit?: string
  type?: string
  documentType?: string
  className?: string
  /** Teor só-texto (sem HTML) — usado para ler menções; não é guardado inteiro. */
  text: string
  /** Documento ou certidão na fonte oficial (só https). */
  url?: string
  recipients: { name: string; pole?: string }[]
  lawyers: { name: string; oab?: string }[]
  cancelled: boolean
}

/** `2026-09-28`, `2026-09-28T00:00:00` ou `28/09/2026` → `2026-09-28`. */
export function sourceDate(item: Pick<DjenItem, "data_disponibilizacao" | "datadisponibilizacao">): string | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(item.data_disponibilizacao ?? "")
  if (iso) return iso[0]
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(item.datadisponibilizacao ?? item.data_disponibilizacao ?? "")
  return br ? `${br[3]}-${br[2]}-${br[1]}` : undefined
}

const clean = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : undefined)
const https = (value: unknown) => {
  const url = clean(value)
  return url && /^https:\/\//i.test(url) ? url : undefined
}

/** Teor para leitura: sem tags HTML nem entidades. */
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

/** `null` quando falta o essencial (id). */
export function mapCommunication(item: DjenItem): Communication | null {
  if (item?.id === undefined || item.id === null) return null
  const cnj = (item.numero_processo ?? item.numeroprocessocommascara ?? "").replace(/\D/g, "")
  const hash = clean(item.hash)
  return {
    externalId: String(item.id),
    date: sourceDate(item),
    cnj: cnj.length === 20 ? cnj : undefined,
    tribunal: clean(item.siglaTribunal),
    unit: clean(item.nomeOrgao),
    type: clean(item.tipoComunicacao),
    documentType: clean(item.tipoDocumento),
    className: clean(item.nomeClasse),
    text: typeof item.texto === "string" ? readableContent(item.texto) : "",
    url: https(item.link) ?? (hash ? djenCertidaoUrl(hash) : undefined),
    recipients: (item.destinatarios ?? []).filter((d) => clean(d?.nome)).map((d) => ({ name: clean(d.nome)!, pole: clean(d.polo) })),
    lawyers: (item.destinatarioadvogados ?? [])
      .map((d) => d?.advogado)
      .filter((a): a is NonNullable<typeof a> => !!a && !!clean(a.nome))
      .map((a) => {
        const number = String(a.numero_oab ?? "").replace(/\D/g, "")
        const uf = String(a.uf_oab ?? "")
          .trim()
          .toUpperCase()
        return { name: clean(a.nome)!, oab: number ? `${uf ? `${uf} ` : ""}${Number(number).toLocaleString("pt-BR")}` : undefined }
      }),
    cancelled: item.ativo === false || /cancel/i.test(item.status ?? ""),
  }
}
