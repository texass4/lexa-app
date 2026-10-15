"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, ChevronDown, CircleSlash, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react"
import { cn } from "cn"
import { FileIcon } from "@/components/shared/file-icon"
import { useOfficeActions } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import { formatFileSize } from "@/lib/core/format"
import { cancelUpload, clearFinished, isActive, retryUpload, useUploadRunner, useUploads, type UploadJob } from "@/lib/documentos/upload-queue"

function StatusLine({ job }: { job: UploadJob }) {
  const percent = job.size ? Math.min(100, Math.round((job.sent / job.size) * 100)) : 0
  switch (job.status) {
    case "waiting":
      return <span className="text-muted-foreground">Aguardando · {formatFileSize(job.size)}</span>
    case "sending":
      return (
        <span className="tabular text-brand-strong">
          Enviando · {percent}% de {formatFileSize(job.size)}
        </span>
      )
    case "saving":
      return <span className="text-brand-strong">Registrando o documento…</span>
    case "done":
      return <span className="text-success">Concluído · {formatFileSize(job.size)}</span>
    case "canceled":
      return <span className="text-muted-foreground">{job.error ?? "Cancelado"}</span>
    default:
      return <span className="text-danger">{job.error ?? "Falhou"}</span>
  }
}

function Row({ job }: { job: UploadJob }) {
  const percent = job.size ? Math.min(100, (job.sent / job.size) * 100) : 0
  return (
    <li className="relative flex items-center gap-3 px-4 py-2.5">
      <FileIcon extension={job.extension} className="h-8 w-6 text-[7px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-foreground" title={job.name}>
          {job.name}
        </p>
        <p className="mt-0.5 truncate text-[11.5px]" aria-live="polite">
          <StatusLine job={job} />
        </p>
        {(job.status === "sending" || job.status === "saving") && (
          <div
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-label={`Progresso de ${job.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-150" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      <span className="flex shrink-0 items-center">
        {job.status === "done" && <Check className="size-4 text-success" aria-label="Concluído" />}
        {job.status === "saving" && <Loader2 className="size-4 animate-spin text-brand motion-reduce:animate-none" aria-hidden />}
        {(job.status === "waiting" || job.status === "sending") && (
          <button
            type="button"
            onClick={() => cancelUpload(job.id)}
            aria-label={`Cancelar envio de ${job.name}`}
            title="Cancelar"
            className="flex size-8 items-center justify-center rounded-control text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <X className="size-4" />
          </button>
        )}
        {(job.status === "failed" || job.status === "canceled") && (
          <button
            type="button"
            onClick={() => retryUpload(job.id)}
            aria-label={`Tentar enviar ${job.name} de novo`}
            title="Tentar de novo"
            className="flex size-8 items-center justify-center rounded-control text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <RotateCcw className="size-4" />
          </button>
        )}
      </span>
    </li>
  )
}

/**
 * Bandeja de envios (canto inferior direito), como nos gerenciadores de arquivos:
 * acompanha cada arquivo enquanto a pessoa continua usando o app.
 */
export function UploadTray() {
  const { saveNewDocument } = useOfficeActions()
  const { can } = useSession()
  const jobs = useUploads()
  const [collapsed, setCollapsed] = React.useState(false)
  const reduce = useReducedMotion()
  useUploadRunner(saveNewDocument)

  if (!can("documents.edit")) return null
  const active = jobs.filter(isActive)
  const done = jobs.filter((j) => j.status === "done").length
  const failed = jobs.filter((j) => j.status === "failed").length
  const title = active.length
    ? `Enviando ${active.length} arquivo${active.length === 1 ? "" : "s"}`
    : failed
      ? `${failed} envio${failed === 1 ? "" : "s"} com falha`
      : `${done} envio${done === 1 ? "" : "s"} concluído${done === 1 ? "" : "s"}`

  return (
    <AnimatePresence>
      {jobs.length > 0 && (
        <motion.section
          aria-label="Envios de documentos"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-border bg-popover shadow-float md:bottom-5"
        >
          <header className="flex items-center gap-2 border-b border-border/80 py-2 pr-2 pl-4">
            <span className="flex size-5 items-center justify-center" aria-hidden>
              {active.length ? (
                <Loader2 className="size-4 animate-spin text-brand motion-reduce:animate-none" />
              ) : failed ? (
                <TriangleAlert className="size-4 text-danger" />
              ) : (
                <Check className="size-4 text-success" />
              )}
            </span>
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground" aria-live="polite">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Mostrar envios" : "Recolher envios"}
              className="flex size-8 items-center justify-center rounded-control text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <ChevronDown className={cn("size-4 transition-transform duration-150", collapsed && "rotate-180")} />
            </button>
            {!active.length && (
              <button
                type="button"
                onClick={clearFinished}
                aria-label="Fechar envios"
                className="flex size-8 items-center justify-center rounded-control text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <X className="size-4" />
              </button>
            )}
          </header>
          {!collapsed && (
            <>
              <ul className="max-h-[300px] divide-y divide-border/60 overflow-y-auto thin-scrollbar">
                {jobs.map((job) => (
                  <Row key={job.id} job={job} />
                ))}
              </ul>
              {!active.length && done > 0 && (
                <footer className="flex items-center justify-between gap-2 border-t border-border/80 px-4 py-2 text-[12px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {failed > 0 && <CircleSlash className="size-3.5 text-danger" aria-hidden />}
                    {done} salvo{done === 1 ? "" : "s"} em Documentos
                  </span>
                  <Link href="/documentos?pasta=recentes" className="font-medium text-brand-strong hover:underline">
                    Ver recentes
                  </Link>
                </footer>
              )}
            </>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  )
}
