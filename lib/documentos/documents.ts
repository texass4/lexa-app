"use client"

import { toast } from "sonner"
import { getSupabase } from "@/lib/supabase/client"
import type { LegalDocument } from "@/types"

/**
 * Tipo de cada formato aceito em Documentos — o mesmo para o envio pela tela e para
 * "salvar em Documentos" no Atendimento. O bucket `documents` só aceita estes tipos
 * (migração 0023): mudou aqui, mude lá também.
 */
export const DOCUMENT_MIME: Record<LegalDocument["extension"], string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain; charset=utf-8",
  jpg: "image/jpeg",
  png: "image/png",
}

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

/**
 * Baixa vários arquivos (seleção). Cada um vem por uma URL assinada de 5 minutos com
 * "salvar como" do próprio Storage; o navegador pode pedir permissão para vários downloads.
 * Devolve quantos foram iniciados.
 */
export async function downloadDocuments(docs: LegalDocument[]) {
  const withFile = docs.filter((d) => d.storagePath)
  let started = 0
  for (const doc of withFile) {
    const url = await documentUrl(doc, { download: true })
    if (!url) continue
    const a = document.createElement("a")
    a.href = url
    a.rel = "noopener"
    a.style.display = "none"
    document.body.appendChild(a)
    a.click()
    a.remove()
    started++
    // Um intervalo curto entre os arquivos: o navegador trata cada um como download próprio.
    await new Promise((r) => setTimeout(r, 450))
  }
  return { started, missing: docs.length - withFile.length }
}
