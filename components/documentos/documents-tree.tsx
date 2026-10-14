"use client"

import * as React from "react"
import { ChevronRight, Clock, Files, Folder, FolderOpen, Scale } from "lucide-react"
import { cn } from "cn"
import { SearchField } from "@/components/ui/search-field"
import { matches } from "@/lib/core/format"
import type { Client, Process } from "@/types"

/**
 * Navegação de Documentos no padrão de um gerenciador de arquivos. Não há pastas no
 * banco: a árvore é derivada das relações reais de cada documento — tipo, cliente e,
 * dentro do cliente, os processos dele.
 */
export interface TreeSelection<K extends string> {
  scope: "todos" | "recentes"
  kind: K
  clientId: string
  processId: string
}

function Item({
  active,
  onClick,
  icon,
  label,
  count,
  depth = 0,
  trailing,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
  depth?: number
  trailing?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      style={depth ? { paddingLeft: 10 + depth * 16 } : undefined}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 [&_svg]:size-4 [&_svg]:shrink-0",
        active ? "bg-sidebar-active font-medium text-brand-strong" : "text-foreground/85 hover:bg-accent hover:text-foreground",
      )}
    >
      <span className={active ? "text-brand" : "text-muted-foreground"}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className={cn("tabular text-[11.5px]", active ? "text-brand-strong" : "text-subtle")}>{count}</span>}
      {trailing}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{title}</p>
      {children}
    </div>
  )
}

export function DocumentsTree<K extends string>({
  value,
  onChange,
  kinds,
  allKind,
  totalCount,
  recentCount,
  clients,
  processesOf,
}: {
  value: TreeSelection<K>
  onChange: (next: TreeSelection<K>) => void
  kinds: { value: K; label: string; count?: number }[]
  /** O valor de "todos os tipos". */
  allKind: K
  totalCount?: number
  recentCount: number
  /** Clientes que têm documentos. */
  clients: Client[]
  processesOf: (clientId: string) => Process[]
}) {
  const [clientQuery, setClientQuery] = React.useState("")
  const base = { scope: "todos" as const, kind: allKind, clientId: "", processId: "" }
  const shownClients = clients.filter((c) => matches(clientQuery, c.name))

  return (
    <nav aria-label="Pastas de documentos" className="flex flex-col">
      <div className="space-y-0.5">
        <Item
          active={value.scope === "todos" && value.kind === allKind && !value.clientId}
          onClick={() => onChange(base)}
          icon={<Files />}
          label="Todos os documentos"
          count={totalCount}
        />
        <Item
          active={value.scope === "recentes"}
          onClick={() => onChange({ ...base, scope: "recentes" })}
          icon={<Clock />}
          label="Recentes"
          count={recentCount}
        />
      </div>

      <Section title="Tipos">
        {kinds
          .filter((k) => k.value !== allKind)
          .map((k) => (
            <Item
              key={k.value}
              active={value.scope === "todos" && value.kind === k.value}
              onClick={() => onChange({ ...value, scope: "todos", kind: k.value })}
              icon={value.kind === k.value ? <FolderOpen /> : <Folder />}
              label={k.label}
              count={k.count}
            />
          ))}
      </Section>

      <Section title="Clientes">
        {clients.length > 8 && (
          <SearchField
            value={clientQuery}
            onChange={setClientQuery}
            placeholder="Filtrar clientes…"
            className="mb-1.5 [&_input]:h-8 [&_input]:text-[12.5px]"
          />
        )}
        <div className="max-h-[360px] space-y-0.5 overflow-y-auto pr-0.5 thin-scrollbar">
          {shownClients.map((c) => {
            const open = value.clientId === c.id
            const processes = open ? processesOf(c.id) : []
            return (
              <div key={c.id}>
                <Item
                  active={open && !value.processId}
                  onClick={() => onChange({ ...value, scope: "todos", clientId: open && !value.processId ? "" : c.id, processId: "" })}
                  icon={open ? <FolderOpen /> : <Folder />}
                  label={c.name}
                  trailing={<ChevronRight className={cn("size-3.5 text-subtle transition-transform", open && "rotate-90")} aria-hidden />}
                />
                {open &&
                  processes.map((p) => (
                    <Item
                      key={p.id}
                      depth={1}
                      active={value.processId === p.id}
                      onClick={() => onChange({ ...value, scope: "todos", clientId: c.id, processId: value.processId === p.id ? "" : p.id })}
                      icon={<Scale />}
                      label={p.type || p.code}
                    />
                  ))}
              </div>
            )
          })}
          {shownClients.length === 0 && <p className="px-2.5 py-2 text-[12px] text-subtle">Nenhum cliente encontrado.</p>}
        </div>
      </Section>
    </nav>
  )
}
