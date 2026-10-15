"use client"

/**
 * Anexos da conversa com a Íntegra IA: o texto é lido AQUI, no navegador (PDF, TXT, CSV,
 * MD), e só o texto vai junto da pergunta. O arquivo não é enviado nem guardado.
 */
import { loadPdfJs } from "@/lib/documentos/pdf"
import { ATTACHMENT_LIMITS, type ChatAttachment } from "./types"

export const ATTACHMENT_ACCEPT = ".pdf,.txt,.csv,.md,application/pdf,text/plain,text/csv,text/markdown"
const TEXT_EXTENSIONS = ["txt", "csv", "md"]

export interface ReadAttachment extends ChatAttachment {
  id: string
  size: number
  /** O texto passou do limite e foi cortado. */
  truncated: boolean
}

export class AttachmentError extends Error {}

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? ""

async function pdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
  try {
    const pdf = await task.promise
    let out = ""
    for (let n = 1; n <= pdf.numPages && out.length < ATTACHMENT_LIMITS.chars + 1000; n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      out += content.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join("") + "\n\n"
    }
    return out
  } finally {
    void task.destroy()
  }
}

/** Lê o arquivo escolhido; recusa o que não dá para ler com mensagem clara. */
export async function readAttachment(file: File): Promise<ReadAttachment> {
  const ext = extensionOf(file.name)
  if (file.size > ATTACHMENT_LIMITS.bytes) throw new AttachmentError(`“${file.name}” passa de ${ATTACHMENT_LIMITS.bytes / 1024 / 1024} MB.`)
  if (file.size === 0) throw new AttachmentError(`“${file.name}” está vazio.`)
  let raw: string
  try {
    if (ext === "pdf") raw = await pdfText(file)
    else if (TEXT_EXTENSIONS.includes(ext)) raw = await file.text()
    else throw new AttachmentError("Formato não aceito. Anexe PDF, TXT, CSV ou MD (Word e imagens ainda não são lidos).")
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError(`Não foi possível ler “${file.name}”.`)
  }
  const text = raw
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (!text) throw new AttachmentError(`“${file.name}” não tem texto para ler (PDF escaneado ou só imagens).`)
  return {
    id: `${file.name}:${file.size}:${file.lastModified}`,
    name: file.name.slice(0, ATTACHMENT_LIMITS.name),
    text: text.slice(0, ATTACHMENT_LIMITS.chars),
    size: file.size,
    truncated: text.length > ATTACHMENT_LIMITS.chars,
  }
}
