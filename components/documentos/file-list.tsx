"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ChevronRight, Star } from "lucide-react"
import { cn } from "cn"
import { UserAvatar } from "@/components/ui/user-avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { useOfficeActions } from "@/lib/store/office-store"
import { getUser } from "@/lib/auth/account"
import { fmtNumericDate, fmtTime } from "@/lib/core/dates"
import { formatFileSize } from "@/lib/core/format"
import { statusOf, type LibraryState, type SortDir, type SortKey } from "@/lib/documentos/library"
import type { LegalDocument } from "@/types"
import { DocumentContextMenu, DocumentMenuButton, useDocumentsActions } from "./document-actions"
import { FolderGlyph } from "./file-thumb"
import { FileTypeTile, TypeBadge } from "./file-type-icon"
import type { FolderItem } from "./use-document-library"

export interface FileViewProps {
  rows: LegalDocument[]
  folders: FolderItem[]
  selected: ReadonlySet<string>
  activeId?: string
  onToggle: (id: string, index: number, shift: boolean) => void
  onToggleAll: (ids: string[], on: boolean) => void
  onOpenFolder: (target: LibraryState) => void
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  isNew: (d: LegalDocument) => boolean
}

/** Cabeçalho de coluna que ordena (mostra o critério e a direção). */
function SortHeader({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string
  k: SortKey
  sort: FileViewProps["sort"]
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sort.key === k
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2 text-left font-medium", className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 whitespace-nowrap outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40",
          active && "text-foreground",
        )}
      >
        {label}
        {active && <Arrow className="size-3" aria-hidden />}
      </button>
    </th>
  )
}

const checkboxClass = "size-4 cursor-pointer rounded-[4px] accent-[var(--brand)]"

export function FileList(props: FileViewProps) {
  const { rows, folders, selected, onToggleAll, sort, onSort } = props
  const all = rows.length > 0 && rows.every((d) => selected.has(d.id))
  const some = !all && rows.some((d) => selected.has(d.id))
  const headerRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = some
  }, [some])

  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
      <thead className="hidden @min-[520px]/files:table-header-group">
        <tr className="text-[12px] text-muted-foreground [&>th]:border-b [&>th]:border-border/80">
          <th scope="col" className="w-[38px] py-3 pr-0 pl-3">
            <label className="touch-target relative flex size-5 cursor-pointer items-center justify-center">
              <input
                ref={headerRef}
                type="checkbox"
                aria-label="Selecionar todos os documentos exibidos"
                checked={all}
                disabled={!rows.length}
                onChange={(e) =>
                  onToggleAll(
                    rows.map((d) => d.id),
                    e.target.checked,
                  )
                }
                className={checkboxClass}
              />
            </label>
          </th>
          <SortHeader label="Nome" k="nome" sort={sort} onSort={onSort} />
          <SortHeader label="Tipo" k="formato" sort={sort} onSort={onSort} className="hidden w-[64px] @min-[640px]/files:table-cell" />
          <th scope="col" className="hidden w-[124px] px-3 py-3 text-left font-medium whitespace-nowrap @min-[520px]/files:table-cell">
            Responsável
          </th>
          <SortHeader label="Modificado em" k="enviado" sort={sort} onSort={onSort} className="hidden w-[116px] @min-[640px]/files:table-cell" />
          <th scope="col" className="hidden w-[86px] px-3 py-3 text-left font-medium @min-[520px]/files:table-cell">
            Status
          </th>
          <th scope="col" className="w-9 py-3 pr-1.5" aria-label="Ações" />
        </tr>
      </thead>
      <tbody>
        {folders.map((f) => (
          <FolderRow key={`${f.type}:${f.id}`} folder={f} onOpen={props.onOpenFolder} />
        ))}
        {rows.map((d, i) => (
          <FileRowConnected key={d.id} doc={d} index={i} {...props} />
        ))}
      </tbody>
    </table>
  )
}

function FolderRow({ folder, onOpen }: { folder: FolderItem; onOpen: (target: LibraryState) => void }) {
  return (
    <tr className="group cursor-pointer transition-colors duration-150 hover:bg-accent/50" onClick={() => onOpen(folder.target)}>
      <td className="border-b border-border/60 py-2.5 pr-0 pl-3" />
      <td className="border-b border-border/60 px-3 py-2.5" colSpan={2}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen(folder.target)
          }}
          className="flex w-full min-w-0 items-center gap-3 text-left outline-none focus-visible:underline"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft/70">
            <FolderGlyph type={folder.type} className="size-6" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{folder.label}</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              {folder.type === "client" ? "Cliente" : "Processo"} · {folder.sublabel}
              {folder.count !== undefined && ` · ${folder.count} documento${folder.count === 1 ? "" : "s"}`}
            </span>
          </span>
        </button>
      </td>
      <td className="hidden border-b border-border/60 @min-[640px]/files:table-cell" />
      <td className="hidden border-b border-border/60 @min-[520px]/files:table-cell" />
      <td className="hidden border-b border-border/60 @min-[640px]/files:table-cell" />
      <td className="hidden border-b border-border/60 @min-[520px]/files:table-cell" />
      <td className="border-b border-border/60 pr-4 text-right">
        <ChevronRight
          className="ml-auto size-4 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      </td>
    </tr>
  )
}

function FileRowConnected({ doc, index, ...props }: FileViewProps & { doc: LegalDocument; index: number }) {
  const { versionOf } = useOfficeActions()
  return (
    <FileRow
      doc={doc}
      index={index}
      modifiedAt={modifiedAt(doc, versionOf("documents", doc.id))}
      checked={props.selected.has(doc.id)}
      active={props.activeId === doc.id}
      fresh={props.isNew(doc)}
      onToggle={props.onToggle}
    />
  )
}

/** Última alteração do registro (renomear, mover, situação); sem alteração, o envio. */
export function modifiedAt(doc: LegalDocument, version: string | null) {
  return version && version > doc.uploadedAt ? version : doc.uploadedAt
}

/** Uma linha: só redesenha quando o próprio documento (ou o vínculo, a seleção) muda. */
const FileRow = React.memo(function FileRow({
  doc: d,
  index,
  modifiedAt: changed,
  checked,
  active,
  fresh,
  onToggle,
}: {
  doc: LegalDocument
  index: number
  modifiedAt: string
  checked: boolean
  active: boolean
  fresh: boolean
  onToggle: FileViewProps["onToggle"]
}) {
  const a = useDocumentsActions()
  const by = getUser(d.uploadedById)
  const favorite = a.isFavorite(d.id)
  const status = statusOf(d)
  const cell = "border-b border-border/60 py-2.5"
  // Clique na linha: detalhes ao lado. Duplo clique (ou "Abrir"): o visualizador.
  const row = (
    <tr
      data-state={checked ? "selected" : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,[role=menuitem]")) return
        if (e.shiftKey) return onToggle(d.id, index, true)
        a.details(d)
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("a,input")) return
        a.open(d)
      }}
      className={cn("group cursor-default transition-colors duration-150", active || checked ? "bg-brand-soft/55" : "hover:bg-accent/45")}
    />
  )
  return (
    <DocumentContextMenu
      doc={d}
      render={React.cloneElement(row, {
        children: (
          <>
            <td className={cn(cell, "w-[38px] pr-0 pl-3")}>
              <label className="touch-target relative flex size-5 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${d.name}`}
                  checked={checked}
                  onChange={() => undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(d.id, index, e.shiftKey)
                  }}
                  className={checkboxClass}
                />
              </label>
            </td>
            <td className={cn(cell, "px-3")}>
              <div className="flex min-w-0 items-center gap-2.5">
                <FileTypeTile extension={d.extension} className="size-8 rounded-[8px]" glyphClassName="h-5 w-4" />
                <div className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => a.details(d)}
                      title={d.name}
                      className="min-w-0 truncate text-left text-[13.5px] font-medium text-foreground outline-none hover:underline focus-visible:underline"
                    >
                      {d.name}
                    </button>
                    {favorite && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Favorito" />}
                    {fresh && <span className="shrink-0 rounded-[4px] bg-brand-soft px-1 text-[10px] font-semibold text-brand-strong">Novo</span>}
                  </span>
                  {/* Telas estreitas: o que as colunas escondidas diriam. */}
                  <p className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-muted-foreground @min-[640px]/files:hidden">
                    <span className="shrink-0 uppercase">{d.extension}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0">{formatFileSize(d.sizeBytes)}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0">{fmtNumericDate(changed)}</span>
                    <span className="truncate @min-[520px]/files:hidden">· {by.firstName}</span>
                    {!d.storagePath && <span className="shrink-0 text-warning">· sem arquivo</span>}
                  </p>
                  {!d.storagePath && <p className="hidden text-[11.5px] text-warning @min-[640px]/files:block">Sem arquivo enviado</p>}
                </div>
              </div>
            </td>
            <td className={cn(cell, "hidden px-3 @min-[640px]/files:table-cell")}>
              <TypeBadge extension={d.extension} />
            </td>
            <td className={cn(cell, "hidden px-3 @min-[520px]/files:table-cell")}>
              <span className="flex min-w-0 items-center gap-2 text-foreground/85" title={`Enviado por ${by.name}`}>
                <UserAvatar name={by.name} src={by.avatarUrl} size="sm" />
                <span className="truncate">{by.name}</span>
              </span>
            </td>
            <td
              className={cn(cell, "tabular hidden px-3 text-[12.5px] whitespace-nowrap text-muted-foreground @min-[640px]/files:table-cell")}
              title={changed === d.uploadedAt ? "Enviado nesta data" : `Enviado em ${fmtNumericDate(d.uploadedAt)}`}
            >
              <span className="block">{fmtNumericDate(changed)}</span>
              <span className="block text-[11px] text-subtle">{fmtTime(changed)}</span>
            </td>
            <td className={cn(cell, "hidden px-3 @min-[520px]/files:table-cell")}>
              <StatusBadge tone={status.tone} size="sm">
                {status.label}
              </StatusBadge>
            </td>
            <td className={cn(cell, "w-9 pr-1.5")}>
              <div className="flex items-center justify-end gap-0.5">
                <DocumentMenuButton doc={d} />
              </div>
            </td>
          </>
        ),
      })}
    />
  )
})
