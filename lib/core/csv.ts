/**
 * CSV para abrir no Excel/Planilhas em português: separador ";", BOM UTF-8
 * (acentos corretos) e aspas escapadas.
 */

export type CsvCell = string | number | undefined | null

const cell = (value: CsvCell) => {
  const text = value === undefined || value === null ? "" : typeof value === "number" ? value.toLocaleString("pt-BR") : value
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCSV(rows: CsvCell[][]): string {
  return "﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n")
}

/** Baixa o arquivo no navegador (nada é enviado a servidor). */
export function downloadCSV(filename: string, rows: CsvCell[][]) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Texto do arquivo enviado. Planilhas salvas pelo Excel em português costumam vir em
 * Windows-1252, não UTF-8: se o UTF-8 não for válido, lê de novo nessa codificação.
 */
export function decodeCSV(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^﻿/, "")
  } catch {
    return new TextDecoder("windows-1252").decode(data)
  }
}

/** Separador mais provável, contado na primeira linha fora de aspas: `;` (Excel pt-BR), `,` ou tabulação. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  let best = ";"
  let bestCount = 0
  for (const candidate of [";", ",", "\t"]) {
    let count = 0
    let quoted = false
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted
      else if (!quoted && ch === candidate) count += 1
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/**
 * CSV → linhas de células (RFC 4180: aspas, aspas dobradas, quebras de linha dentro
 * de aspas). Linhas totalmente vazias são descartadas.
 */
export function parseCSV(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, "")
  const rows: string[][] = []
  let row: string[] = []
  let cellText = ""
  let quoted = false

  const endCell = () => {
    row.push(cellText.trim())
    cellText = ""
  }
  const endRow = () => {
    endCell()
    if (row.some((value) => value !== "")) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cellText += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cellText += ch
      continue
    }
    // Aspas só abrem no começo da célula; no meio do texto são literais (`Ana "A"`).
    if (ch === '"' && cellText.trim() === "") {
      quoted = true
      cellText = ""
    } else if (ch === delimiter) endCell()
    else if (ch === "\n") endRow()
    else if (ch !== "\r") cellText += ch
  }
  if (cellText !== "" || row.length) endRow()
  return rows
}
