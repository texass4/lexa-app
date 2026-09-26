/** Exportação de dados em arquivo (CSV para planilhas, JSON para portabilidade). */

const cell = (value: unknown) => {
  const text = value === undefined || value === null ? "" : String(value)
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV com `;` — o separador que o Excel em português abre sem configurar nada. */
export function toCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n")
}

/** Nome de arquivo seguro a partir de um texto livre ("Maria & Filhos" → "maria-filhos"). */
export function fileSlug(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "arquivo"
  )
}

/** Baixa o conteúdo gerado no navegador (nada vai para o servidor). */
export function downloadFile(filename: string, content: string, type: string) {
  // BOM: o Excel reconhece os acentos do CSV em UTF-8.
  const blob = new Blob([type.startsWith("text/csv") ? "﻿" + content : content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
