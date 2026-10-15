"use client"

import { getSupabase } from "@/lib/supabase/client"
import { DOCUMENT_MIME } from "./documents"
import type { Extension } from "./library"

export type UploadError = "denied" | "too-large" | "format" | "exists" | "network" | "session" | "failed"

export class UploadFailure extends Error {
  constructor(readonly reason: UploadError) {
    super(reason)
  }
}

/** Mensagem para a pessoa (sem detalhe técnico). */
export function uploadErrorMessage(reason: UploadError | "aborted" | "record") {
  switch (reason) {
    case "denied":
      return "Sem permissão para enviar documentos neste escritório."
    case "too-large":
      return "O arquivo passa do limite de 25 MB."
    case "format":
      return "Formato não aceito pelo armazenamento."
    case "exists":
      return "Já existe um arquivo com este identificador. Tente de novo."
    case "network":
      return "A conexão caiu durante o envio."
    case "session":
      return "Sua sessão expirou. Entre de novo para enviar."
    case "record":
      return "O arquivo foi enviado, mas o documento não pôde ser registrado. Nada ficou salvo."
    case "aborted":
      return "Envio cancelado."
    default:
      return "Não foi possível enviar o arquivo."
  }
}

/**
 * Envia o arquivo ao bucket privado `documents`, no caminho do escritório, com o
 * progresso real da transferência (o SDK do Supabase não informa progresso).
 * Vale a mesma API e as mesmas políticas do Storage: quem decide é o servidor.
 * Resolve só quando o Storage confirma a gravação.
 */
export async function uploadToStorage(
  file: Blob,
  path: string,
  extension: Extension,
  { onProgress, signal }: { onProgress?: (sent: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new UploadFailure("session")
  if (signal?.aborted) throw new DOMException("Envio cancelado", "AbortError")

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")
  const url = `${base}/storage/v1/object/documents/${path.split("/").map(encodeURIComponent).join("/")}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.setRequestHeader("authorization", `Bearer ${token}`)
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    xhr.setRequestHeader("content-type", DOCUMENT_MIME[extension])
    xhr.setRequestHeader("x-upsert", "false")
    xhr.setRequestHeader("cache-control", "max-age=3600")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total)
    }
    const abort = () => xhr.abort()
    signal?.addEventListener("abort", abort, { once: true })
    const done = () => signal?.removeEventListener("abort", abort)
    xhr.onload = () => {
      done()
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      reject(new UploadFailure(reasonFor(xhr.status, xhr.responseText)))
    }
    xhr.onerror = () => {
      done()
      reject(new UploadFailure("network"))
    }
    xhr.onabort = () => {
      done()
      reject(new DOMException("Envio cancelado", "AbortError"))
    }
    xhr.send(file)
  })
}

function reasonFor(status: number, body: string): UploadError {
  if (status === 401) return "session"
  if (status === 413 || /maximum allowed size|too large/i.test(body)) return "too-large"
  if (status === 415 || /mime type/i.test(body)) return "format"
  if (status === 409 || /already exists|Duplicate/i.test(body)) return "exists"
  if (status === 403 || /row-level security|Unauthorized/i.test(body)) return "denied"
  return "failed"
}

/** Remove um arquivo enviado cujo registro não foi gravado (não deixa arquivo órfão no Storage). */
export async function removeUploaded(path: string) {
  await getSupabase()
    .storage.from("documents")
    .remove([path])
    .catch(() => undefined)
}
