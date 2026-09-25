"use client"

import { toast } from "sonner"
import { getSupabase } from "@/lib/supabase/client"
import type { LegalDocument } from "@/types"

/** URL temporária (5 min) do arquivo no Storage; null se não há arquivo ou sem permissão. */
export async function documentUrl(doc: LegalDocument, { download = false } = {}) {
  if (!doc.storagePath) return null
  const { data, error } = await getSupabase()
    .storage.from("documents")
    .createSignedUrl(doc.storagePath, 300, download ? { download: doc.name } : undefined)
  return error ? null : data.signedUrl
}

export async function downloadDocument(doc: LegalDocument) {
  const url = await documentUrl(doc, { download: true })
  if (!url) {
    toast("Este documento não tem arquivo salvo.", { description: doc.name })
    return
  }
  window.location.assign(url)
}
