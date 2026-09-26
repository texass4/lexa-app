/** Nomes, extensões e tipos de arquivo das mídias do WhatsApp (navegador e servidor). */

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "application/zip": "zip",
}

/** "audio/ogg; codecs=opus" → "audio/ogg" */
export const baseMime = (mime?: string) => mime?.split(";")[0].trim().toLowerCase() || undefined

export function extensionOf(fileName?: string, mime?: string) {
  const fromName = fileName?.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase()
  return fromName ?? EXTENSIONS[baseMime(mime) ?? ""] ?? "bin"
}

/** Nome seguro para caminho do Storage (sem acento, barra ou espaço). */
export function safeFileName(fileName: string | undefined, fallback: string, mime?: string) {
  const ext = extensionOf(fileName, mime)
  const stem = (fileName ?? fallback)
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return `${stem || fallback}.${ext}`
}

/** Tipo de anexo pelo MIME escolhido no computador. */
export function attachmentKindFor(mime: string): "image" | "audio" | "document" {
  const base = baseMime(mime) ?? ""
  if (["image/jpeg", "image/png", "image/webp"].includes(base)) return "image"
  if (base.startsWith("audio/")) return "audio"
  return "document"
}
