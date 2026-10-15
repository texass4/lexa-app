"use client"

import * as React from "react"
import { ChevronRight, Clock, Star } from "lucide-react"
import { cn } from "cn"
import { SearchField } from "@/components/ui/search-field"
import { useOfficeData } from "@/lib/store/office-store"
import { matches, formatFileSize } from "@/lib/core/format"
import { processSubject } from "@/lib/processos/label"
import { formatCNJ, onlyDigits } from "@/lib/processos/cnj"
import { CATEGORIES, EMPTY_STATE, type LibraryState } from "@/lib/documentos/library"
import type { FavoritesStatus } from "@/lib/documentos/favorites"
import type { Client, Process } from "@/types"
import { FileTypeGlyph } from "./file-type-icon"

/** Pasta colorida da árvore (como no Drive): azul para cliente/grupo, laranja para categoria. */
function FolderIcon({ tone, className }: { tone: "blue" | "orange"; className?: string }) {
  const [stroke, fill] = tone === "blue" ? ["#3B7BEA", "#E3EDFD"] : ["#F08C00", "#FFF1DB"]
  return (
    <svg viewBox="0 0 20 16" aria-hidden className={cn("h-[14px] w-[17px] shrink-0", className)}>
      <path
        d="M1.5 3A1.5 1.5 0 0 1 3 1.5h4.2l1.8 2h8a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** "0001234-56" — o começo do número CNJ, como o escritório costuma chamar o processo. */
export function shortProcessNumber(p: Pick<Process, "number" | "code">) {
  const digits = onlyDigits(p.number ?? "")
  if (digits.length === 20) return formatCNJ(digits).split(".")[0]
  return p.number?.trim() || p.code
}

function Row({
  depth = 0,
  active,
  onClick,
  icon,
  label,
  count,
  expandable,
  open,
  onToggle,
  title,
}: {
  depth?: number
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number | string
  expandable?: boolean
  open?: boolean
  onToggle?: () => void
  title?: string
}) {
  return (
    <div
      className={cn(
        "group flex h-8 min-w-0 items-center rounded-[8px] pr-2 text-[13px] transition-colors duration-150",
        active ? "bg-brand-soft/80 font-medium text-brand-strong" : "text-foreground/85 hover:bg-accent hover:text-foreground",
      )}
      style={{ paddingLeft: 4 + depth * 14 }}
    >
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Recolher ${label}` : `Expandir ${label}`}
          aria-expanded={open}
          className="flex size-5 shrink-0 items-center justify-center rounded text-subtle outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ChevronRight className={cn("size-3.5 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
        </button>
      ) : (
        <span className="size-5 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={onClick}
        title={title ?? label}
        aria-current={active ? "page" : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[6px] pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className={cn("tabular shrink-0 text-[11.5px]", active ? "text-brand-strong" : "text-subtle")}>{count}</span>}
      </button>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pt-4 pb-1 text-[10.5px] font-semibold tracking-[0.1em] text-subtle uppercase">{children}</p>
}

/**
 * Árvore da Central de Documentos, no padrão do Drive: Todos, Recentes e Favoritos; os
 * clientes com os processos deles e, dentro de cada processo, as categorias (pastas
 * laranja). Tudo vem dos vínculos que cada documento já tem — não há pasta paralela.
 * Contagens só quando exatas (o cliente aberto tem todos os documentos na memória).
 */
export function DocumentsNav({
  state,
  onNavigate,
  counts,
  clients,
  favoritesStatus,
}: {
  state: LibraryState
  onNavigate: (next: LibraryState) => void
  counts: { all?: number; bytes?: number; recent?: number; favorites?: number; kind: (k: string) => number | undefined }
  clients: Client[]
  favoritesStatus: FavoritesStatus
}) {
  const data = useOfficeData()
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set())
  const [clientQuery, setClientQuery] = React.useState("")
  const go = (next: Partial<LibraryState>) => onNavigate({ ...EMPTY_STATE, ...next })
  const inClientes = state.section === "clientes"
  // O que está aberto na tela fica aberto na árvore (sem precisar clicar na seta).
  const isOpen = (key: string) =>
    expanded.has(key) ||
    (inClientes &&
      ((key === `c:${state.clientId}` && !!state.clientId) ||
        (key === `cp:${state.clientId}` && !!state.clientId) ||
        (key === `p:${state.processId}` && !!state.processId)))
  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (isOpen(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // O cliente aberto vem primeiro (com os processos e as pastas dele à vista).
  const shown = clients
    .filter((c) => matches(clientQuery, c.name) || (inClientes && c.id === state.clientId))
    .sort((a, b) => Number(inClientes && b.id === state.clientId) - Number(inClientes && a.id === state.clientId))
  // Contagens exatas só do cliente aberto (todos os documentos dele estão carregados).
  const clientDocs = state.clientId ? data.documents.filter((d) => d.clientId === state.clientId) : []
  const countIn = (processId: string, kind?: string) => clientDocs.filter((d) => d.processId === processId && (!kind || d.kind === kind)).length

  return (
    <nav aria-label="Pastas de documentos" className="flex flex-col">
      <div className="space-y-0.5">
        <Row
          active={state.section === "todos" && !state.kind}
          onClick={() => go({})}
          icon={<FileTypeGlyph extension="docx" className="h-4 w-[13px]" />}
          label="Todos os documentos"
          count={counts.all}
        />
        <Row
          active={state.section === "recentes"}
          onClick={() => go({ section: "recentes" })}
          icon={<Clock className="size-4 text-muted-foreground" />}
          label="Recentes"
          count={counts.recent}
        />
        <Row
          active={state.section === "favoritos"}
          onClick={() => go({ section: "favoritos" })}
          icon={<Star className="size-4 text-gold" />}
          label="Favoritos"
          count={favoritesStatus === "unavailable" ? "—" : counts.favorites}
          title={favoritesStatus === "unavailable" ? "Favoritos ainda não estão ativos neste escritório." : undefined}
        />
      </div>

      <Heading>Clientes</Heading>
      {clients.length > 8 && (
        <SearchField
          value={clientQuery}
          onChange={setClientQuery}
          placeholder="Filtrar clientes…"
          className="mb-1 [&_input]:h-8 [&_input]:text-[12.5px]"
        />
      )}
      <div className="space-y-0.5">
        {shown.map((c) => {
          const clientKey = `c:${c.id}`
          const groupKey = `cp:${c.id}`
          const processes = data.processes
            .filter((p) => p.clientId === c.id)
            .sort((a, b) => shortProcessNumber(a).localeCompare(shortProcessNumber(b), "pt-BR"))
          const exact = inClientes && state.clientId === c.id
          return (
            <div key={c.id}>
              <Row
                active={exact && !state.processId && !state.kind}
                onClick={() => go({ section: "clientes", clientId: c.id })}
                icon={<FolderIcon tone="blue" />}
                label={c.name}
                expandable={processes.length > 0}
                open={isOpen(clientKey)}
                onToggle={() => toggle(clientKey)}
              />
              {isOpen(clientKey) && processes.length > 0 && (
                <div className="space-y-0.5">
                  <Row
                    depth={1}
                    active={false}
                    onClick={() => toggle(groupKey)}
                    icon={<FolderIcon tone="blue" />}
                    label="Processos"
                    count={processes.length}
                    expandable
                    open={isOpen(groupKey)}
                    onToggle={() => toggle(groupKey)}
                  />
                  {isOpen(groupKey) &&
                    processes.map((p) => {
                      const processKey = `p:${p.id}`
                      const activeProcess = exact && state.processId === p.id
                      return (
                        <div key={p.id}>
                          <Row
                            depth={2}
                            active={activeProcess && !state.kind}
                            onClick={() => go({ section: "clientes", clientId: c.id, processId: p.id })}
                            icon={<FileTypeGlyph extension="docx" className="h-4 w-[13px]" />}
                            label={shortProcessNumber(p)}
                            title={`${processSubject(p)} · ${p.number || p.code}`}
                            count={exact ? countIn(p.id) : undefined}
                            expandable
                            open={isOpen(processKey)}
                            onToggle={() => toggle(processKey)}
                          />
                          {isOpen(processKey) &&
                            CATEGORIES.map((k) => (
                              <Row
                                key={k.value}
                                depth={3}
                                active={activeProcess && state.kind === k.value}
                                onClick={() => go({ section: "clientes", clientId: c.id, processId: p.id, kind: k.value })}
                                icon={<FolderIcon tone="orange" />}
                                label={k.label}
                                count={exact ? countIn(p.id, k.value) || undefined : undefined}
                              />
                            ))}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}
        {shown.length === 0 && (
          <p className="py-1.5 pl-7 text-[12px] text-subtle">{clients.length ? "Nenhum cliente encontrado." : "Nenhum cliente com documentos."}</p>
        )}
      </div>

      <Heading>Categorias</Heading>
      <div className="space-y-0.5">
        {CATEGORIES.map((c) => (
          <Row
            key={c.value}
            active={state.section === "todos" && state.kind === c.value && !state.clientId}
            onClick={() => go({ kind: c.value })}
            icon={<FolderIcon tone="orange" />}
            label={c.label}
            count={counts.kind(c.value)}
          />
        ))}
      </div>

      {counts.all !== undefined && counts.bytes !== undefined && (
        <p className="mt-4 border-t border-border/70 px-2.5 pt-3 text-[11.5px] leading-relaxed text-subtle">
          {counts.all} arquivo{counts.all === 1 ? "" : "s"} · {formatFileSize(counts.bytes)} no armazenamento do escritório
        </p>
      )}
    </nav>
  )
}
