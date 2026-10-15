"use client"

import * as React from "react"
import { ChevronRight, Clock, CloudUpload, Files, Star, Tag, UsersRound } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { SearchField } from "@/components/ui/search-field"
import { matches, formatFileSize } from "@/lib/core/format"
import { CATEGORIES, EMPTY_STATE, type LibraryState } from "@/lib/documentos/library"
import type { FavoritesStatus } from "@/lib/documentos/favorites"
import type { Client } from "@/types"
import { FolderGlyph } from "./file-thumb"
import type { FolderItem } from "./use-document-library"

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
  depth = 0,
  trailing,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number | string
  depth?: number
  trailing?: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? "page" : undefined}
      style={depth ? { paddingLeft: 10 + depth * 14 } : undefined}
      className={cn(
        "group flex h-9 w-full min-w-0 items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40",
        active ? "bg-sidebar-active font-medium text-brand-strong" : "text-foreground/85 hover:bg-accent hover:text-foreground",
      )}
    >
      <span className={cn("flex shrink-0 items-center [&_svg]:size-4", active ? "text-brand" : "text-muted-foreground group-hover:text-foreground")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className={cn("tabular shrink-0 text-[11.5px]", active ? "text-brand-strong" : "text-subtle")}>{count}</span>}
      {trailing}
    </button>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pt-5 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{children}</p>
}

/**
 * Navegação da Central de Documentos. As seções e os clientes/processos são lugares;
 * as categorias são filtros (os tipos de documento) — por isso aparecem como etiquetas,
 * não como pastas. Contagens só quando são exatas.
 */
export function DocumentsNav({
  state,
  onNavigate,
  counts,
  clients,
  processFolders,
  favoritesStatus,
  canEdit,
  onUpload,
}: {
  state: LibraryState
  onNavigate: (next: LibraryState) => void
  counts: { all?: number; bytes?: number; recent?: number; favorites?: number; kind: (k: string) => number | undefined }
  clients: Client[]
  /** Processos (com documentos) do cliente aberto. */
  processFolders: FolderItem[]
  favoritesStatus: FavoritesStatus
  canEdit: boolean
  onUpload: () => void
}) {
  const reduce = useReducedMotion()
  const [clientsOpen, setClientsOpen] = React.useState(state.section === "clientes")
  const [clientQuery, setClientQuery] = React.useState("")
  const inClientes = state.section === "clientes"
  if (inClientes && !clientsOpen) setClientsOpen(true)
  const shown = clients.filter((c) => matches(clientQuery, c.name))
  const go = (next: Partial<LibraryState>) => onNavigate({ ...EMPTY_STATE, ...next })

  return (
    <nav aria-label="Navegação de documentos" className="flex flex-col">
      {canEdit && (
        <Button className="mb-3 w-full justify-start" onClick={onUpload}>
          <CloudUpload /> Enviar arquivos
        </Button>
      )}
      <div className="space-y-0.5">
        <NavItem
          active={state.section === "todos" && !state.kind}
          onClick={() => go({})}
          icon={<Files />}
          label="Todos os documentos"
          count={counts.all}
        />
        <NavItem
          active={state.section === "recentes"}
          onClick={() => go({ section: "recentes" })}
          icon={<Clock />}
          label="Recentes"
          count={counts.recent}
        />
        <NavItem
          active={state.section === "favoritos"}
          onClick={() => go({ section: "favoritos" })}
          icon={<Star />}
          label="Favoritos"
          count={favoritesStatus === "unavailable" ? "—" : counts.favorites}
          title={favoritesStatus === "unavailable" ? "Favoritos ainda não estão ativos neste escritório." : undefined}
        />
        <div className="relative">
          <NavItem
            active={inClientes && !state.clientId}
            onClick={() => go({ section: "clientes" })}
            icon={<UsersRound />}
            label="Clientes"
            trailing={<span className="w-6" />}
          />
          <button
            type="button"
            aria-label={clientsOpen ? "Recolher clientes" : "Expandir clientes"}
            aria-expanded={clientsOpen}
            onClick={() => setClientsOpen((o) => !o)}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-[6px] text-subtle outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronRight className={cn("size-3.5 transition-transform duration-150", clientsOpen && "rotate-90")} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {clientsOpen && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {clients.length > 8 && (
                <SearchField
                  value={clientQuery}
                  onChange={setClientQuery}
                  placeholder="Filtrar clientes…"
                  className="my-1 pl-5 [&_input]:h-8 [&_input]:text-[12.5px]"
                />
              )}
              <div className="max-h-[340px] space-y-0.5 overflow-y-auto pr-0.5 thin-scrollbar">
                {shown.map((c) => {
                  const open = inClientes && state.clientId === c.id
                  return (
                    <div key={c.id}>
                      <NavItem
                        depth={1}
                        active={open && !state.processId}
                        onClick={() => go({ section: "clientes", clientId: c.id })}
                        icon={<FolderGlyph type="client" className="size-4" />}
                        label={c.name}
                      />
                      {open &&
                        processFolders.map((p) => (
                          <NavItem
                            key={p.id}
                            depth={2}
                            active={state.processId === p.id}
                            onClick={() => go({ section: "clientes", clientId: c.id, processId: p.id })}
                            icon={<FolderGlyph type="process" className="size-4" />}
                            label={p.label}
                            count={p.count}
                            title={`${p.label} · ${p.sublabel}`}
                          />
                        ))}
                    </div>
                  )
                })}
                {shown.length === 0 && (
                  <p className="py-2 pl-6 text-[12px] text-subtle">
                    {clients.length ? "Nenhum cliente encontrado." : "Nenhum cliente com documentos."}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Heading>Categorias</Heading>
      <div className="space-y-0.5">
        {CATEGORIES.map((c) => (
          <NavItem
            key={c.value}
            active={state.section === "todos" && state.kind === c.value && !state.clientId}
            onClick={() => go({ kind: c.value })}
            icon={<Tag />}
            label={c.label}
            count={counts.kind(c.value)}
          />
        ))}
      </div>

      {counts.all !== undefined && counts.bytes !== undefined && (
        <p className="mt-5 border-t border-border px-2.5 pt-3 text-[11.5px] leading-relaxed text-subtle">
          {counts.all} arquivo{counts.all === 1 ? "" : "s"} · {formatFileSize(counts.bytes)} no armazenamento do escritório
        </p>
      )}
    </nav>
  )
}
