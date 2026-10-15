"use client"

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"

/**
 * pdf.js sob demanda (só quando a pessoa vê uma miniatura ou abre um PDF), com o
 * trabalho pesado num Web Worker. A leitura é por faixas (`Range`) da URL assinada
 * temporária: para a miniatura, só o necessário para a primeira página.
 *
 * Usa a versão "legacy" do pdf.js: a padrão exige APIs muito recentes do JavaScript
 * (ex.: `Map.getOrInsertComputed`) que vários navegadores em uso ainda não têm.
 */
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs")

let lib: Promise<PdfJs> | null = null

export function loadPdfJs(): Promise<PdfJs> {
  lib ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" })
    }
    return pdfjs
  })
  lib.catch(() => (lib = null))
  return lib
}

export async function openPdf(url: string): Promise<{ task: PDFDocumentLoadingTask; pdf: Promise<PDFDocumentProxy> }> {
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({
    url,
    disableAutoFetch: true,
    rangeChunkSize: 128 * 1024,
    // Fontes padrão do sistema: nenhum arquivo de fonte é baixado de fora do Íntegra.
    useSystemFonts: true,
  })
  return { task, pdf: task.promise }
}

/** Arquivos maiores que isto não ganham miniatura na grade (o ícone basta; abrir mostra tudo). */
export const THUMBNAIL_MAX_BYTES = 12 * 1024 * 1024

const thumbnails = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()
let running = 0
const queue: (() => void)[] = []
const MAX_PARALLEL = 2

function slot<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running++
      work()
        .then(resolve, reject)
        .finally(() => {
          running--
          queue.shift()?.()
        })
    }
    if (running < MAX_PARALLEL) start()
    else queue.push(start)
  })
}

/**
 * Miniatura da primeira página (PNG em memória, guardada enquanto a aba estiver aberta).
 * `key` identifica o arquivo (documento + caminho); `getUrl` busca a URL assinada só se preciso.
 */
export function pdfThumbnail(key: string, getUrl: () => Promise<string | null>, width = 320): Promise<string | null> {
  const cached = thumbnails.get(key)
  if (cached) return Promise.resolve(cached)
  const inflight = pending.get(key)
  if (inflight) return inflight
  const job = slot(async () => {
    const url = await getUrl()
    if (!url) return null
    const { task, pdf } = await openPdf(url)
    try {
      const doc = await pdf
      const page = await doc.getPage(1)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const png = canvas.toDataURL("image/png")
      thumbnails.set(key, png)
      return png
    } finally {
      void task.destroy()
    }
  })
    .catch(() => null)
    .finally(() => pending.delete(key))
  pending.set(key, job)
  return job
}

export function cachedPdfThumbnail(key: string) {
  return thumbnails.get(key)
}
