/** Itens por página na lista de documentos. */
export const PAGE_SIZE = 10

/** Números de página com reticências (1 … 4 5 6 … 12). */
export function pageNumbers(current: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: (number | "…")[] = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(pages - 1, current + 1)
  if (from > 2) out.push("…")
  for (let p = from; p <= to; p++) out.push(p)
  if (to < pages - 1) out.push("…")
  out.push(pages)
  return out
}
