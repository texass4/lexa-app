"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronRight, Download, Star } from "lucide-react"
import { cn } from "cn"
import { UserAvatar } from "@/components/ui/user-avatar"
import { FileIcon } from "@/components/shared/file-icon"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { getUser } from "@/lib/auth/account"
import { fmtNumericDate, fmtTime } from "@/lib/core/dates"
import { formatFileSize } from "@/lib/core/format"
import { processSubject } from "@/lib/processos/label"
import type { LibraryState, SortDir, SortKey } from "@/lib/documentos/library"
import type { Client, LegalDocument, Process } from "@/types"
import { DocumentContextMenu, DocumentMenuButton, useDocumentsActions } from "./document-actions"
import { FolderGlyph } from "./file-thumb"
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
          "-mx-1 inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40",
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
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
        <thead className="@max-3xl/files:hidden">
          <tr className="bg-surface-muted/60 text-[12px] text-muted-foreground [&>th]:border-b [&>th]:border-border">
            <th scope="col" className="w-11 py-2 pr-0 pl-4">
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
            <th scope="col" className="hidden w-[21%] px-3 py-2 text-left font-medium @4xl/files:table-cell">
              Cliente e processo
            </th>
            <SortHeader label="Categoria" k="categoria" sort={sort} onSort={onSort} className="hidden w-[140px] @5xl/files:table-cell" />
            <SortHeader label="Enviado em" k="enviado" sort={sort} onSort={onSort} className="hidden w-[112px] @3xl/files:table-cell" />
            <th scope="col" className="hidden w-[124px] px-3 py-2 text-left font-medium @6xl/files:table-cell">
              Enviado por
            </th>
            <th scope="col" className="w-[84px] py-2 pr-3" aria-label="Ações" />
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
    </div>
  )
}

function FolderRow({ folder, onOpen }: { folder: FolderItem; onOpen: (target: LibraryState) => void }) {
  return (
    <tr className="group cursor-pointer transition-colors duration-150 hover:bg-accent/50" onClick={() => onOpen(folder.target)}>
      <td className="border-b border-border/70 py-2 pr-0 pl-4" />
      <td className="border-b border-border/70 px-3 py-2" colSpan={2}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen(folder.target)
          }}
          className="flex w-full min-w-0 items-center gap-3 text-left outline-none focus-visible:underline"
        >
          <FolderGlyph type={folder.type} className="size-8" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{folder.label}</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              {folder.type === "client" ? "Cliente" : "Processo"} · {folder.sublabel}
              {folder.count !== undefined && ` · ${folder.count} documento${folder.count === 1 ? "" : "s"}`}
            </span>
          </span>
        </button>
      </td>
      <td className="hidden border-b border-border/70 @5xl/files:table-cell" />
      <td className="hidden border-b border-border/70 @3xl/files:table-cell" />
      <td className="hidden border-b border-border/70 @6xl/files:table-cell" />
      <td className="border-b border-border/70 pr-4 text-right">
        <ChevronRight
          className="ml-auto size-4 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      </td>
    </tr>
  )
}

function FileRowConnected({ doc, index, ...props }: FileViewProps & { doc: LegalDocument; index: number }) {
  const data = useOfficeData()
  return (
    <FileRow
      doc={doc}
      index={index}
      client={byId(data.clients, doc.clientId)}
      process={byId(data.processes, doc.processId)}
      checked={props.selected.has(doc.id)}
      active={props.activeId === doc.id}
      fresh={props.isNew(doc)}
      onToggle={props.onToggle}
    />
  )
}

/** Uma linha: só redesenha quando o próprio documento (ou o vínculo, a seleção) muda. */
const FileRow = React.memo(function FileRow({
  doc: d,
  index,
  client,
  process,
  checked,
  active,
  fresh,
  onToggle,
}: {
  doc: LegalDocument
  index: number
  client?: Client
  process?: Process
  checked: boolean
  active: boolean
  fresh: boolean
  onToggle: FileViewProps["onToggle"]
}) {
  const a = useDocumentsActions()
  const by = getUser(d.uploadedById)
  const favorite = a.isFavorite(d.id)
  const cell = "border-b border-border/70 py-2"
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
      className={cn(
        "group cursor-default transition-colors duration-150",
        active ? "bg-brand-soft/60" : checked ? "bg-brand-soft/35" : "hover:bg-accent/50",
      )}
    />
  )
  return (
    <DocumentContextMenu
      doc={d}
      render={React.cloneElement(row, {
        children: (
          <>
            <td className={cn(cell, "w-11 pr-0 pl-4")}>
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
              <div className="flex min-w-0 items-center gap-3">
                <FileIcon extension={d.extension} className="h-9 w-7" />
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => a.details(d)}
                    title={d.name}
                    className="block max-w-full truncate text-left text-[13.5px] font-medium text-foreground outline-none hover:underline focus-visible:underline"
                  >
                    {d.name}
                  </button>
                  <p className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
                    {favorite && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Favorito" />}
                    {fresh && <span className="shrink-0 rounded-[4px] bg-brand-soft px-1 text-[10px] font-semibold text-brand-strong">Novo</span>}
                    <span className="uppercase">{d.extension}</span>
                    <span aria-hidden>·</span>
                    <span>{formatFileSize(d.sizeBytes)}</span>
                    {!d.storagePath && <span className="text-warning">· sem arquivo</span>}
                    {/* Telas estreitas: o que as colunas escondidas diriam. */}
                    <span className="@3xl/files:hidden">· {fmtNumericDate(d.uploadedAt)}</span>
                    <span className="truncate @4xl/files:hidden">{client ? `· ${client.name}` : ""}</span>
                  </p>
                </div>
              </div>
            </td>
            <td className={cn(cell, "hidden px-3 @4xl/files:table-cell")}>
              <div className="flex min-w-0 flex-col">
                {client ? (
                  <Link href={`/clientes/${client.id}?tab=documentos`} className="truncate text-foreground/90 hover:underline" title={client.name}>
                    {client.name}
                  </Link>
                ) : (
                  <span className="text-subtle">—</span>
                )}
                {process && (
                  <Link
                    href={`/processos/${process.id}`}
                    title={`${processSubject(process)} · ${process.code}`}
                    className="truncate text-[11.5px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {processSubject(process)}
                  </Link>
                )}
              </div>
            </td>
            <td className={cn(cell, "hidden px-3 @5xl/files:table-cell")}>
              <span className="inline-block max-w-full truncate rounded-full bg-surface-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
                {d.kind}
              </span>
            </td>
            <td
              className={cn(cell, "tabular hidden px-3 whitespace-nowrap text-muted-foreground @3xl/files:table-cell")}
              title={`${fmtNumericDate(d.uploadedAt)} às ${fmtTime(d.uploadedAt)}`}
            >
              {fmtNumericDate(d.uploadedAt)}
            </td>
            <td className={cn(cell, "hidden px-3 @6xl/files:table-cell")}>
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <UserAvatar name={by.name} src={by.avatarUrl} size="xs" />
                <span className="truncate">{by.firstName}</span>
              </span>
            </td>
            <td className={cn(cell, "w-[84px] pr-3")}>
              <div className="flex items-center justify-end gap-0.5">
                {/* Ações rápidas: aparecem no hover/foco, sem mexer no layout (o espaço já é reservado). */}
                {d.storagePath && (
                  <button
                    type="button"
                    onClick={() => a.download([d])}
                    aria-label={`Baixar ${d.name}`}
                    title="Baixar"
                    className="hidden size-8 items-center justify-center rounded-[8px] text-subtle opacity-0 outline-none transition-opacity duration-150 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/40 @3xl/files:flex"
                  >
                    <Download className="size-4" />
                  </button>
                )}
                <DocumentMenuButton doc={d} />
              </div>
            </td>
          </>
        ),
      })}
    />
  )
})
