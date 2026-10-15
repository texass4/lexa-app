"use client"

import * as React from "react"
import Link from "next/link"
import { Check, ChevronDown, Download, Eye, Folder, ShieldCheck, Star, UserRound, UsersRound } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { fmtNumericDate, fmtRelative, fmtTime } from "@/lib/core/dates"
import { formatFileSize } from "@/lib/core/format"
import { getUser } from "@/lib/auth/account"
import { processSubject } from "@/lib/processos/label"
import { DOCUMENT_STATUSES, statusOf } from "@/lib/documentos/library"
import type { LegalDocument } from "@/types"
import { DocumentMenuButton, useDocumentsActions } from "./document-actions"
import { FileThumb } from "./file-thumb"
import { FileTypeGlyph } from "./file-type-icon"
import { modifiedAt } from "./file-list"
import { shortProcessNumber } from "./documents-nav"

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-[17px]" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] text-muted-foreground">{label}</p>
        <div className="mt-0.5 min-w-0 text-[13px] text-foreground">{children}</div>
      </div>
    </div>
  )
}

/**
 * Painel do documento (à direita): nome, prévia real do arquivo, abrir/baixar, quem é o
 * responsável, onde fica, quem acessa, a situação e o link para compartilhar. Nada é
 * estimado: tudo vem do cadastro do documento e das regras de acesso do escritório.
 */
export function DocumentDetails({
  doc,
  onClose,
  className,
  embedded = false,
}: {
  doc: LegalDocument
  onClose: () => void
  className?: string
  /** Dentro de um painel que já tem o próprio botão de fechar (celular e tablet). */
  embedded?: boolean
}) {
  const data = useOfficeData()
  const { versionOf } = useOfficeActions()
  const a = useDocumentsActions()
  const client = byId(data.clients, doc.clientId)
  const process = byId(data.processes, doc.processId)
  const by = getUser(doc.uploadedById)
  const favorite = a.isFavorite(doc.id)
  const status = statusOf(doc)
  const changed = modifiedAt(doc, versionOf("documents", doc.id))
  const activity = data.activities
    .filter((x) => x.documentId === doc.id)
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, 6)

  return (
    <aside
      aria-label={`Detalhes de ${doc.name}`}
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-card", className)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 thin-scrollbar">
        <div className={cn("flex items-start gap-1", embedded && "pr-10")}>
          <h2 className="min-w-0 flex-1 text-[14px] leading-snug font-semibold break-words text-foreground">{doc.name}</h2>
          {a.favoritesReady && (
            <button
              type="button"
              aria-pressed={favorite}
              aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              onClick={() => void a.favorite([doc], !favorite)}
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Star className={cn("size-4", favorite && "fill-gold text-gold")} />
            </button>
          )}
          <DocumentMenuButton doc={doc} />
          {!embedded && (
            <button type="button" onClick={onClose} className="sr-only focus:not-sr-only focus:rounded focus:px-2 focus:text-[12px]">
              Fechar detalhes
            </button>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] whitespace-nowrap text-muted-foreground">
          <FileTypeGlyph extension={doc.extension} className="h-[15px] w-[12px]" />
          <span className="uppercase">{doc.extension}</span>
          <span aria-hidden>·</span>
          {formatFileSize(doc.sizeBytes)}
          <span aria-hidden>·</span>
          <span className="tabular">
            {fmtNumericDate(changed)} {fmtTime(changed)}
          </span>
        </p>

        <button
          type="button"
          onClick={() => a.open(doc)}
          aria-label={`Visualizar ${doc.name}`}
          className="group mt-3.5 block w-full overflow-hidden rounded-[12px] border border-border bg-surface-muted/40 outline-none transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-xs focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <FileThumb
            key={doc.id}
            doc={doc}
            width={520}
            className="aspect-[4/5] w-full bg-white dark:bg-surface"
            iconClassName="h-20 w-16 text-[12px]"
          />
        </button>

        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => a.open(doc)}>
            <Eye /> Visualizar
          </Button>
          {doc.storagePath && (
            <Button variant="secondary" size="icon" aria-label={`Baixar ${doc.name}`} title="Baixar" onClick={() => a.download([doc])}>
              <Download />
            </Button>
          )}
        </div>

        <div className="mt-3 divide-y divide-border/60">
          <Info icon={<UserRound />} label="Responsável">
            <span className="flex items-center gap-2">
              <UserAvatar name={by.name} src={by.avatarUrl} size="sm" />
              <span className="truncate font-medium">{by.name}</span>
            </span>
          </Info>
          <Info icon={<Folder />} label="Pasta">
            {process ? (
              <Link href={`/processos/${process.id}`} className="block hover:underline" title={processSubject(process)}>
                Processo {shortProcessNumber(process)}
              </Link>
            ) : client ? (
              <Link href={`/clientes/${client.id}?tab=documentos`} className="block hover:underline">
                {client.name}
              </Link>
            ) : (
              <span>Todos os documentos</span>
            )}
            <span className="block text-[12px] text-muted-foreground">
              {[client && process ? client.name : null, doc.kind].filter(Boolean).join(" · ")}
            </span>
          </Info>
          <Info icon={<ShieldCheck />} label="Permissões">
            Equipe do escritório com acesso a Documentos
            <span className="block text-[12px] text-muted-foreground">Arquivo privado: abre só com login.</span>
          </Info>
          <Info icon={<Check />} label="Status">
            {a.canEdit ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  aria-label={`Status: ${status.label}. Alterar`}
                >
                  <StatusBadge tone={status.tone} size="sm">
                    {status.label}
                  </StatusBadge>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {DOCUMENT_STATUSES.map((st) => (
                    <DropdownMenuItem
                      key={st.value}
                      className="h-auto items-start gap-2.5 px-2 py-1.5 text-[13px]"
                      onClick={() => void a.setStatus([doc], st.value)}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", st.tone === "warning" ? "bg-warning" : "bg-success")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block">{st.label}</span>
                        <span className="block text-[11.5px] text-muted-foreground">{st.hint}</span>
                      </span>
                      {status.value === st.value && <Check className="mt-1 size-4" aria-hidden />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <StatusBadge tone={status.tone} size="sm">
                {status.label}
              </StatusBadge>
            )}
          </Info>
        </div>

        {doc.storagePath ? (
          <Button variant="secondary" className="mt-3 w-full" onClick={() => a.copyLinks([doc])} title="Copia um link de download válido por 7 dias">
            <UsersRound /> Compartilhar
          </Button>
        ) : (
          <p className="mt-3 rounded-[10px] bg-warning-soft px-3 py-2 text-[12px] text-warning">Só o registro: nenhum arquivo foi enviado.</p>
        )}

        <section aria-label="Atividade" className="mt-4 border-t border-border/60 pt-3">
          <h3 className="text-[11px] font-semibold tracking-[0.06em] text-subtle uppercase">Atividade</h3>
          {activity.length ? (
            <ol className="mt-2 space-y-2">
              {activity.map((x) => (
                <li key={x.id} className="text-[12px] leading-snug">
                  <p className="text-foreground">
                    <span className="font-medium">{x.actor}</span> {x.message}
                  </p>
                  <p className="text-[11px] text-muted-foreground" title={new Date(x.at).toLocaleString("pt-BR")}>
                    {fmtRelative(x.at)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">Envios, renomeações e mudanças de situação aparecem aqui.</p>
          )}
        </section>
      </div>
    </aside>
  )
}
