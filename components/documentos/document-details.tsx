"use client"

import * as React from "react"
import Link from "next/link"
import { Download, Eye, Star, StarOff, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { fmtLongDate, fmtRelative, fmtTime, parse } from "@/lib/core/dates"
import { formatFileSize } from "@/lib/core/format"
import { getUser } from "@/lib/auth/account"
import { processSubject } from "@/lib/processos/label"
import { formatOf } from "@/lib/documentos/library"
import type { LegalDocument } from "@/types"
import { DocumentMenuButton, useDocumentsActions } from "./document-actions"
import { FileThumb } from "./file-thumb"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  )
}

/**
 * Detalhes do documento: o que está salvo no cadastro, onde ele fica na Central, as
 * ações permitidas e a atividade registrada para ele. Nada é estimado.
 */
/** `embedded`: dentro de um painel que já tem o próprio botão de fechar (celular e tablet). */
export function DocumentDetails({
  doc,
  onClose,
  className,
  embedded = false,
}: {
  doc: LegalDocument
  onClose: () => void
  className?: string
  embedded?: boolean
}) {
  const data = useOfficeData()
  const { versionOf } = useOfficeActions()
  const a = useDocumentsActions()
  const client = byId(data.clients, doc.clientId)
  const process = byId(data.processes, doc.processId)
  const by = getUser(doc.uploadedById)
  const favorite = a.isFavorite(doc.id)
  const format = formatOf(doc.extension)
  // Alteração do registro no banco (renomear, mover): só quando veio depois do envio.
  const version = versionOf("documents", doc.id)
  const changedAt = version && new Date(version).getTime() - parse(doc.uploadedAt).getTime() > 60_000 ? new Date(version) : undefined
  const activity = data.activities
    .filter((x) => x.documentId === doc.id)
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, 8)

  return (
    <aside
      aria-label={`Detalhes de ${doc.name}`}
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-card", className)}
    >
      <header className={cn("flex items-center gap-1 border-b border-border py-2 pl-4", embedded ? "pr-14" : "pr-2")}>
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">Detalhes</h2>
        <DocumentMenuButton doc={doc} />
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="flex size-8 shrink-0 items-center justify-center rounded-control text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <X className="size-4" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        <button
          type="button"
          onClick={() => a.open(doc)}
          aria-label={`Abrir ${doc.name}`}
          className="group block w-full border-b border-border bg-surface-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset"
        >
          <FileThumb
            key={doc.id}
            doc={doc}
            width={480}
            className="aspect-[4/3] w-full transition-opacity duration-150 group-hover:opacity-90"
            iconClassName="h-20 w-16 text-[12px]"
          />
        </button>
        <div className="px-4 pt-3.5 pb-3">
          <p className="text-[14.5px] leading-snug font-semibold break-words text-foreground">{doc.name}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {format?.label.replace(/ \(.*\)$/, "") ?? doc.extension.toUpperCase()} · {formatFileSize(doc.sizeBytes)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => a.open(doc)}>
              <Eye /> Abrir
            </Button>
            {doc.storagePath && (
              <Button variant="secondary" size="sm" onClick={() => a.download([doc])}>
                <Download /> Baixar
              </Button>
            )}
            {a.favoritesReady && (
              <Button
                variant="secondary"
                size="icon-sm"
                aria-pressed={favorite}
                aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                onClick={() => a.favorite([doc], !favorite)}
              >
                {favorite ? <StarOff /> : <Star />}
              </Button>
            )}
          </div>
        </div>

        <dl className="divide-y divide-border/70 border-t border-border px-4 py-1">
          <Row label="Categoria">{doc.kind}</Row>
          <Row label="Enviado em">
            {fmtLongDate(doc.uploadedAt)}, {fmtTime(doc.uploadedAt)}
          </Row>
          <Row label="Enviado por">
            <span className="flex items-center gap-2">
              <UserAvatar name={by.name} src={by.avatarUrl} size="xs" />
              <span className="truncate">{by.name}</span>
            </span>
          </Row>
          {changedAt && (
            <Row label="Alterado em">
              <span title={changedAt.toLocaleString("pt-BR")}>{fmtRelative(changedAt.toISOString())}</span>
            </Row>
          )}
          <Row label="Cliente">
            {client ? (
              <Link href={`/clientes/${client.id}?tab=documentos`} className="hover:underline">
                {client.name}
              </Link>
            ) : (
              <span className="text-subtle">Sem cliente</span>
            )}
          </Row>
          <Row label="Processo">
            {process ? (
              <Link href={`/processos/${process.id}`} className="block hover:underline">
                <span className="block">{processSubject(process)}</span>
                <span className="font-mono text-[11.5px] text-subtle">{process.code}</span>
              </Link>
            ) : (
              <span className="text-subtle">Sem processo</span>
            )}
          </Row>
          <Row label="Local">
            {client ? (
              <span className="text-[12.5px]">
                Clientes › {client.name}
                {process && <> › {processSubject(process)}</>}
              </span>
            ) : (
              <span className="text-[12.5px]">Todos os documentos › {doc.kind}</span>
            )}
          </Row>
          <Row label="Arquivo">
            {doc.storagePath ? "Salvo no armazenamento do escritório" : <span className="text-warning">Só o registro, sem arquivo enviado</span>}
          </Row>
        </dl>

        <section aria-label="Atividade" className="border-t border-border px-4 pt-3 pb-4">
          <h3 className="text-[12px] font-semibold tracking-[0.04em] text-subtle uppercase">Atividade</h3>
          {activity.length ? (
            <ol className="mt-2 space-y-2.5">
              {activity.map((x) => (
                <li key={x.id} className="text-[12.5px] leading-snug">
                  <p className="text-foreground">
                    <span className="font-medium">{x.actor}</span> {x.message}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground" title={new Date(x.at).toLocaleString("pt-BR")}>
                    {fmtRelative(x.at)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              Envios, renomeações e mudanças de lugar feitos a partir de agora aparecem aqui.
            </p>
          )}
        </section>
      </div>
    </aside>
  )
}
