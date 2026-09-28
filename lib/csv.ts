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
