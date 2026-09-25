const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

/** R$ 42.800 */
export function formatCurrency(value: number) {
  return brl.format(value).replace(/\u00a0/g, " ")
}

/** R$ 42,8 mil */
export function formatCurrencyCompact(value: number) {
  if (value >= 1000) {
    const k = value / 1000
    return `R$ ${k.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
  }
  return formatCurrency(value)
}

export function formatNumber(value: number, minDigits = 1) {
  return String(value).padStart(minDigits, "0")
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
}

export function initials(name: string) {
  const parts = (name ?? "").replace(/&/g, "").split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "—"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Min\u00fasculas e sem acento \u2014 para busca. */
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/** `normalize` + espa\u00e7o \u00fanico, sem bordas \u2014 para comparar e gerar identidade. */
export const fold = (text: string) => normalize(text).replace(/\s+/g, " ").trim()

export function matches(query: string, ...fields: (string | undefined)[]) {
  const q = normalize(query.trim())
  if (!q) return true
  return fields.some((f) => f && normalize(f).includes(q))
}

let seq = 0
export function uid(prefix: string) {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}${seq}`
}
