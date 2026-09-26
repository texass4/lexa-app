"use client"

import { toast } from "sonner"
import { getSupabase } from "@/lib/supabase/client"
import type { LegalDocument } from "@/types"

/** URL temporária (5 min por padrão) do arquivo no Storage; null se não há arquivo ou sem permissão. */
export async function documentUrl(doc: LegalDocument, { download = false, expiresIn = 300 } = {}) {
  if (!doc.storagePath) return null
  const { data, error } = await getSupabase()
    .storage.from("documents")
    .createSignedUrl(doc.storagePath, expiresIn, download ? { download: doc.name } : undefined)
  return error ? null : data.signedUrl
}

const SHARE_DAYS = 7

/** Copia um link assinado do arquivo, válido por 7 dias — para enviar ao cliente. */
export async function copyDocumentLink(doc: LegalDocument) {
  const url = await documentUrl(doc, { download: true, expiresIn: SHARE_DAYS * 24 * 60 * 60 })
  if (!url) {
    toast("Este documento não tem arquivo salvo.", { description: doc.name })
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    toast.success("Link copiado.", { description: `Qualquer pessoa com o link baixa o arquivo por ${SHARE_DAYS} dias.` })
  } catch {
    toast.error("Não foi possível copiar o link.", { description: "Permita o acesso à área de transferência e tente de novo." })
  }
}

export async function downloadDocument(doc: LegalDocument) {
  const url = await documentUrl(doc, { download: true })
  if (!url) {
    toast("Este documento não tem arquivo salvo.", { description: doc.name })
    return
  }
  window.location.assign(url)
}
