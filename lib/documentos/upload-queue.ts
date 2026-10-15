"use client"

import * as React from "react"
import { uid } from "@/lib/core/format"
import { currentOrgId } from "@/lib/auth/account"
import type { NewDocumentInput } from "@/lib/store/office-store"
import type { DocumentKind, LegalDocument } from "@/types"
import { extensionOf, uploadIssue, type Extension } from "./library"
import { removeUploaded, UploadFailure, uploadErrorMessage, uploadToStorage } from "./upload"

/**
 * Fila de envios da Central de Documentos. Cada arquivo passa por estados reais:
 * aguardando → enviando (progresso da transferência) → registrando (o banco grava o
 * documento) → concluído. Falhou ou cancelado também ficam visíveis, com nova tentativa.
 * A fila vive enquanto a aba estiver aberta: trocar de tela não interrompe os envios.
 */
export type UploadStatus = "waiting" | "sending" | "saving" | "done" | "failed" | "canceled"

export interface UploadDestination {
  kind: DocumentKind
  clientId?: string
  processId?: string
}

export interface UploadJob {
  id: string
  file: File
  name: string
  size: number
  extension: Extension
  destination: UploadDestination
  status: UploadStatus
  sent: number
  error?: string
  /** Documento criado (quando concluído). */
  documentId?: string
}

type Saver = (input: NewDocumentInput) => Promise<LegalDocument | null>

let jobs: UploadJob[] = []
const listeners = new Set<() => void>()
const controllers = new Map<string, AbortController>()
const MAX_PARALLEL = 2

function emit() {
  for (const l of listeners) l()
}

function patch(id: string, next: Partial<UploadJob>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...next } : j))
  emit()
}

/** Põe os arquivos na fila (os inválidos não entram: a tela já mostrou o motivo). */
export function enqueueUploads(files: File[], destination: UploadDestination) {
  const added: UploadJob[] = []
  for (const file of files) {
    const extension = extensionOf(file.name)
    if (!extension || uploadIssue(file)) continue
    added.push({ id: uid("up"), file, name: file.name, size: file.size, extension, destination, status: "waiting", sent: 0 })
  }
  jobs = [...jobs, ...added]
  emit()
  return added.length
}

export function cancelUpload(id: string) {
  const job = jobs.find((j) => j.id === id)
  if (!job) return
  if (job.status === "waiting") patch(id, { status: "canceled", error: uploadErrorMessage("aborted") })
  // Durante o registro no banco não há como desfazer pela metade: o envio segue até o fim.
  else if (job.status === "sending") controllers.get(id)?.abort()
}

export function retryUpload(id: string) {
  const job = jobs.find((j) => j.id === id)
  if (job && (job.status === "failed" || job.status === "canceled")) patch(id, { status: "waiting", sent: 0, error: undefined })
}

/** Tira da lista o que já terminou (concluídos, falhas e cancelados). */
export function clearFinished() {
  jobs = jobs.filter((j) => j.status === "waiting" || j.status === "sending" || j.status === "saving")
  emit()
}

export const isActive = (j: UploadJob) => j.status === "waiting" || j.status === "sending" || j.status === "saving"

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useUploads() {
  return React.useSyncExternalStore(
    subscribe,
    () => jobs,
    () => jobs,
  )
}

async function run(job: UploadJob, save: Saver) {
  const controller = new AbortController()
  controllers.set(job.id, controller)
  // Caminho no escritório: a política do Storage só aceita a pasta de quem está logado.
  const storagePath = `${currentOrgId()}/${uid("file")}.${job.extension}`
  patch(job.id, { status: "sending", sent: 0 })
  try {
    await uploadToStorage(job.file, storagePath, job.extension, {
      signal: controller.signal,
      onProgress: (sent) => patch(job.id, { sent }),
    })
  } catch (error) {
    controllers.delete(job.id)
    if (error instanceof DOMException && error.name === "AbortError") patch(job.id, { status: "canceled", error: uploadErrorMessage("aborted") })
    else patch(job.id, { status: "failed", error: uploadErrorMessage(error instanceof UploadFailure ? error.reason : "failed") })
    return
  }
  controllers.delete(job.id)
  patch(job.id, { status: "saving", sent: job.size })
  const doc = await save({
    name: job.name,
    kind: job.destination.kind,
    clientId: job.destination.clientId,
    processId: job.destination.processId,
    extension: job.extension,
    sizeBytes: job.size,
    storagePath,
  }).catch(() => null)
  if (!doc) {
    // O registro não foi gravado: o arquivo não pode ficar solto no armazenamento.
    await removeUploaded(storagePath)
    patch(job.id, { status: "failed", error: uploadErrorMessage("record") })
    return
  }
  patch(job.id, { status: "done", documentId: doc.id })
}

/**
 * Executa a fila (no máximo dois envios ao mesmo tempo). Montado uma vez, no shell
 * do app, com a função do store que grava o documento.
 */
export function useUploadRunner(save: Saver) {
  const list = useUploads()
  const saveRef = React.useRef(save)
  React.useEffect(() => {
    saveRef.current = save
  })
  React.useEffect(() => {
    const running = list.filter((j) => j.status === "sending" || j.status === "saving").length
    const next = list.filter((j) => j.status === "waiting").slice(0, Math.max(0, MAX_PARALLEL - running))
    for (const job of next) {
      // Marca já como "enviando" para o próximo efeito não pegar o mesmo arquivo.
      jobs = jobs.map((j) => (j.id === job.id ? { ...j, status: "sending" } : j))
      void run(job, (input) => saveRef.current(input))
    }
    if (next.length) emit()
  }, [list])
}
