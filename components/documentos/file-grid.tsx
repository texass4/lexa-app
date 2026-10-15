"use client"

import * as React from "react"
import { Star } from "lucide-react"
import { cn } from "cn"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { fmtNumericDate } from "@/lib/core/dates"
import type { LegalDocument } from "@/types"
import { DocumentContextMenu, DocumentMenuButton, useDocumentsActions } from "./document-actions"
import { FileThumb, FolderGlyph } from "./file-thumb"
import type { FileViewProps } from "./file-list"

export function FileGrid(props: FileViewProps) {
  const { rows, folders, onOpenFolder } = props
  return (
    <div className="space-y-5">
      {folders.length > 0 && (
        <section aria-label="Pastas">
          <h3 className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-subtle uppercase">
            {folders[0].type === "client" ? "Clientes" : "Processos"}
          </h3>
          <ul className="grid grid-cols-1 gap-2 @xl/files:grid-cols-2 @4xl/files:grid-cols-3 @6xl/files:grid-cols-4">
            {folders.map((f) => (
              <li key={`${f.type}:${f.id}`}>
                <button
                  type="button"
                  onClick={() => onOpenFolder(f.target)}
                  className="flex w-full min-w-0 items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5 text-left outline-none transition-[border-color,background-color] duration-150 hover:border-border-strong hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <FolderGlyph type={f.type} className="size-8" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{f.label}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {f.sublabel}
                      {f.count !== undefined && ` · ${f.count} documento${f.count === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows.length > 0 && (
        <section aria-label="Arquivos">
          {folders.length > 0 && <h3 className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-subtle uppercase">Arquivos</h3>}
          <ul className="grid grid-cols-2 gap-3 @2xl/files:grid-cols-3 @4xl/files:grid-cols-4 @6xl/files:grid-cols-5">
            {rows.map((d, i) => (
              <GridCardConnected key={d.id} doc={d} index={i} {...props} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function GridCardConnected({ doc, index, ...props }: FileViewProps & { doc: LegalDocument; index: number }) {
  const data = useOfficeData()
  return (
    <GridCard
      doc={doc}
      index={index}
      clientName={byId(data.clients, doc.clientId)?.name}
      checked={props.selected.has(doc.id)}
      active={props.activeId === doc.id}
      fresh={props.isNew(doc)}
      onToggle={props.onToggle}
    />
  )
}

const GridCard = React.memo(function GridCard({
  doc: d,
  index,
  clientName,
  checked,
  active,
  fresh,
  onToggle,
}: {
  doc: LegalDocument
  index: number
  clientName?: string
  checked: boolean
  active: boolean
  fresh: boolean
  onToggle: FileViewProps["onToggle"]
}) {
  const a = useDocumentsActions()
  const favorite = a.isFavorite(d.id)
  const card = (
    <li
      data-state={checked ? "selected" : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,[role=menuitem]")) return
        if (e.shiftKey) return onToggle(d.id, index, true)
        a.details(d)
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("input")) return
        a.open(d)
      }}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-[12px] border bg-card transition-[border-color,box-shadow] duration-150",
        active
          ? "border-brand/60 ring-2 ring-brand/20"
          : checked
            ? "border-brand/45 ring-1 ring-brand/15"
            : "border-border hover:border-border-strong hover:shadow-card",
      )}
    />
  )
  return (
    <DocumentContextMenu
      doc={d}
      render={React.cloneElement(card, {
        children: (
          <>
            <div className="relative aspect-[4/3] border-b border-border/70 bg-surface-muted/60">
              <FileThumb doc={d} className="size-full" />
              {/* Seleção e menu por cima da miniatura: visíveis no hover, na seleção e sempre no toque. */}
              <label
                className={cn(
                  "touch-target absolute top-2 left-2 flex size-7 cursor-pointer items-center justify-center rounded-[7px] bg-card/90 shadow-xs ring-1 ring-border transition-opacity duration-150 [@media(hover:none)]:opacity-100",
                  checked ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
                )}
              >
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${d.name}`}
                  checked={checked}
                  onChange={() => undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(d.id, index, e.shiftKey)
                  }}
                  className="size-4 cursor-pointer accent-[var(--brand)]"
                />
              </label>
              <div className="absolute top-1.5 right-1.5 rounded-[8px] bg-card/90 shadow-xs ring-1 ring-border">
                <DocumentMenuButton doc={d} />
              </div>
              {fresh && (
                <span className="absolute bottom-2 left-2 rounded-[5px] bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-brand-foreground">
                  Novo
                </span>
              )}
            </div>
            <div className="min-w-0 px-3 py-2.5">
              <button
                type="button"
                onClick={() => a.details(d)}
                title={d.name}
                className="flex w-full min-w-0 items-center gap-1.5 text-left outline-none focus-visible:underline"
              >
                {favorite && <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-label="Favorito" />}
                <span className="truncate text-[13px] font-medium text-foreground">{d.name}</span>
              </button>
              <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                {d.kind} · {fmtNumericDate(d.uploadedAt)}
              </p>
              {clientName && <p className="truncate text-[11.5px] text-subtle">{clientName}</p>}
            </div>
          </>
        ),
      })}
    />
  )
})
