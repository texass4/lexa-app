/** Texto de busca: minúsculo e sem acentos, para "reuniao" achar "Reunião". */
export function normalizeForSearch(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" \n ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[ \t]+/g, " ")
    .trim()
}

/** Padrão LIKE seguro para o termo buscado (escapa %, _ e \). */
export function likePattern(query: string): string {
  return `%${normalizeForSearch(query).replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/** Trecho em volta da primeira ocorrência do termo, para mostrar nos resultados. */
export function snippetAround(text: string, query: string, radius = 60): string | null {
  const needle = normalizeForSearch(query)
  if (!needle || !text) return null
  const flat = text.replace(/\s+/g, " ")
  // A normalização preserva o comprimento caractere a caractere para letras latinas comuns.
  const haystack = flat.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const index = haystack.indexOf(needle)
  if (index < 0 || haystack.length !== flat.length) {
    return index < 0 ? null : flat.slice(0, radius * 2)
  }
  const start = Math.max(0, index - radius)
  const end = Math.min(flat.length, index + needle.length + radius)
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`
}
