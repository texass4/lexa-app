"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Download, RefreshCw, ScrollText, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { NativeSelect } from "@/components/ui/field"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { SideSheet } from "@/components/ui/side-sheet"
import { StatusBadge } from "@/components/ui/status-badge"
import { useAdminData } from "@/lib/admin/client"
import { AUDIT_ACTIONS, AUDIT_GROUPS, AUDIT_SEVERITY, auditLabel, type AuditEntry, type AuditGroup, type AuditSeverity } from "@/lib/admin/catalog"
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions"
import { AdminHeader } from "../ui/admin-header"
import { PeriodFilter, usePeriod } from "../ui/period-filter"
import { AUDIT_ICON } from "../ui/audit-list"

const PAGE = 50

interface AuditData {
  entries: AuditEntry[]
  total: number
  organizations: { id: string; name: string }[]
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })

function exportCsv(entries: AuditEntry[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const head = ["Data/hora", "Usuário", "E-mail", "Papel", "Escritório", "Ação", "Gravidade", "Detalhes", "IP"]
  const rows = entries.map((e) =>
    [fmtDateTime(e.at), e.actorName, e.actorEmail, e.actorRole, e.organizationName, auditLabel(e.action), e.severity, e.summary, e.ip].map(esc).join(";"),
  )
  const url = URL.createObjectURL(new Blob([`﻿${[head.map(esc).join(";"), ...rows].join("\n")}`], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `lexa-auditoria-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function Detail({ entry }: { entry: AuditEntry }) {
  const rows: [string, React.ReactNode][] = [
    ["Data/hora", fmtDateTime(entry.at)],
    ["Ação", `${auditLabel(entry.action)} (${entry.action})`],
    ["Gravidade", <StatusBadge key="s" tone={AUDIT_SEVERITY[entry.severity].tone}>{AUDIT_SEVERITY[entry.severity].label}</StatusBadge>],
    ["Usuário", entry.actorName ? `${entry.actorName} · ${entry.actorEmail ?? ""}` : "Sistema"],
    ["Papel", entry.actorRole ? (ROLE_LABELS[entry.actorRole as Role] ?? entry.actorRole) : "—"],
    [
      "Escritório",
      entry.organizationId ? (
        <Link key="o" href={`/admin/escritorios/${entry.organizationId}`} className="hover:underline">
          {entry.organizationName}
        </Link>
      ) : (
        "—"
      ),
    ],
    ["Alvo", entry.targetLabel ?? entry.targetId ?? "—"],
    ["IP", entry.ip ?? "Não informado"],
    ["Navegador", entry.userAgent ?? "—"],
  ]
  return (
    <div className="space-y-5 p-5">
      {entry.summary && <p className="rounded-[10px] bg-surface-muted/60 px-3.5 py-3 text-[13px] leading-relaxed">{entry.summary}</p>}
      <dl className="divide-y divide-border rounded-[12px] border border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5">
            <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-right text-[12.5px] break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {Object.keys(entry.metadata).length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Dados do evento</p>
          <pre className="max-h-[280px] overflow-auto rounded-[10px] border border-border bg-surface-muted/50 p-3 font-mono text-[11.5px] leading-relaxed thin-scrollbar">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
      <p className="text-[11.5px] text-subtle">Registros de auditoria não podem ser editados.</p>
    </div>
  )
}

export function AuditView() {
  const params = useSearchParams()
  const router = useRouter()
  const { period, update, query: periodQuery } = usePeriod("30d")
  const [group, setGroup] = React.useState<"all" | AuditGroup>("all")
  const [severity, setSeverity] = React.useState<"all" | AuditSeverity>((params.get("severity") as AuditSeverity | null) ?? "all")
  const [org, setOrg] = React.useState(params.get("org") ?? "all")
  const actor = params.get("actor")
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [page, setPage] = React.useState(0)
  const [open, setOpen] = React.useState<AuditEntry | null>(null)
  const [shown, setShown] = React.useState<AuditEntry | null>(null)
  if (open && open !== shown) setShown(open)

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  // Filtro mudou → volta à primeira página (antes de montar a URL da busca).
  const filterKey = `${periodQuery}|${group}|${severity}|${org}|${actor}|${debounced}`
  const [lastKey, setLastKey] = React.useState(filterKey)
  const currentPage = filterKey !== lastKey ? 0 : page
  if (filterKey !== lastKey) {
    setLastKey(filterKey)
    setPage(0)
  }

  const qs = new URLSearchParams({ limit: String(PAGE), offset: String(currentPage * PAGE) })
  if (group !== "all") qs.set("group", group)
  if (severity !== "all") qs.set("severity", severity)
  if (org !== "all") qs.set("org", org)
  if (actor) qs.set("actor", actor)
  if (debounced) qs.set("q", debounced)
  const { data, error, loading, reload } = useAdminData<AuditData>(`/api/admin/audit?${periodQuery}&${qs.toString()}`)

  const entries = data?.entries ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const actorName = actor ? entries.find((e) => e.actorId === actor)?.actorName : undefined
  const entry = open ?? shown

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Sistema"
        title="Atividade / Logs"
        description="Auditoria de acessos e alterações: quem fez, em qual escritório, quando e de onde. Os registros não podem ser editados."
        actions={
          <>
            <Button variant="secondary" onClick={() => exportCsv(entries)} disabled={!entries.length}>
              <Download /> Exportar página
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Atualizar" onClick={reload} disabled={loading}>
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <PeriodFilter period={period} onChange={update} />
          <FilterTabs
            ariaLabel="Gravidade"
            layoutId="audit-severity"
            value={severity}
            onChange={setSeverity}
            options={[
              { value: "all", label: "Todas" },
              { value: "info", label: "Informativas" },
              { value: "warning", label: "Atenção" },
              { value: "critical", label: "Críticas" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <SearchField value={search} onChange={setSearch} placeholder="Detalhes, e-mail, nome ou IP…" className="col-span-2 sm:w-[300px]" />
          <NativeSelect aria-label="Tipo de ação" value={group} onChange={(e) => setGroup(e.target.value as "all" | AuditGroup)} className="sm:w-[180px]">
            <option value="all">Todas as ações</option>
            {(Object.keys(AUDIT_GROUPS) as AuditGroup[]).map((g) => (
              <option key={g} value={g}>
                {AUDIT_GROUPS[g]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Escritório" value={org} onChange={(e) => setOrg(e.target.value)} className="sm:w-[220px]">
            <option value="all">Todos os escritórios</option>
            {(data?.organizations ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
          {actor && (
            <button
              type="button"
              onClick={() => router.replace("/admin/atividade")}
              className="col-span-2 inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-gold/30 bg-gold-soft px-3 text-[12.5px] font-medium text-gold-dark hover:border-gold/50"
            >
              Usuário: {actorName ?? "selecionado"} <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {error && !data ? (
        <TableShell>
          <ErrorState onRetry={reload} description={error} />
        </TableShell>
      ) : !data ? (
        <SkeletonTable rows={10} />
      ) : entries.length === 0 ? (
        <TableShell>
          <EmptyState
            icon={<ScrollText />}
            title="Nenhum registro encontrado."
            description="Entradas, saídas e alterações administrativas passam a ser registradas a partir da migração 0003_lexa_admin. Ajuste o período ou os filtros."
          />
        </TableShell>
      ) : (
        <TableShell className={cn("transition-opacity", loading && "opacity-60")}>
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full min-w-[980px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <Th>Data/hora</Th>
                  <Th>Usuário</Th>
                  <Th>Escritório</Th>
                  <Th>Ação</Th>
                  <Th>Detalhes</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-0">
                {entries.map((e) => {
                  const Icon = AUDIT_ICON[AUDIT_ACTIONS[e.action]?.group ?? "settings"]
                  return (
                    <tr
                      key={e.id}
                      tabIndex={0}
                      onClick={() => setOpen(e)}
                      onKeyDown={(ev) => ev.key === "Enter" && setOpen(e)}
                      className="cursor-pointer outline-none transition-colors hover:bg-surface-muted/50 focus-visible:bg-surface-muted/60"
                    >
                      <Td className="tabular whitespace-nowrap text-[12.5px] text-muted-foreground">{fmtDateTime(e.at)}</Td>
                      <Td>
                        <p className="max-w-[200px] truncate font-medium">{e.actorName ?? "Sistema"}</p>
                        {e.actorEmail && <p className="max-w-[200px] truncate text-[12px] text-muted-foreground">{e.actorEmail}</p>}
                      </Td>
                      <Td className="max-w-[180px] truncate">{e.organizationName ?? <span className="text-subtle">Plataforma</span>}</Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Icon className={cn("size-3.5 shrink-0", e.severity === "critical" ? "text-danger" : e.severity === "warning" ? "text-warning" : "text-subtle")} />
                          <span className="whitespace-nowrap">{auditLabel(e.action)}</span>
                          {e.severity !== "info" && (
                            <StatusBadge tone={AUDIT_SEVERITY[e.severity].tone} size="sm" dot={false}>
                              {AUDIT_SEVERITY[e.severity].label}
                            </StatusBadge>
                          )}
                        </span>
                      </Td>
                      <Td className="max-w-[320px] truncate text-muted-foreground">{e.summary ?? "—"}</Td>
                      <Td className="font-mono text-[12px] text-muted-foreground">{e.ip ?? "—"}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-muted/30 px-5 py-2.5 text-[12px] text-muted-foreground">
            <span>
              {page * PAGE + 1}–{page * PAGE + entries.length} de {total.toLocaleString("pt-BR")}
            </span>
            <span className="flex items-center gap-1">
              <Button size="icon-xs" variant="ghost" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft />
              </Button>
              <span className="tabular px-1">
                {page + 1}/{pages}
              </span>
              <Button size="icon-xs" variant="ghost" aria-label="Próxima página" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight />
              </Button>
            </span>
          </div>
        </TableShell>
      )}

      <SideSheet
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Detalhes do registro"
        header={
          <div className="border-b border-border px-5 pt-5 pb-4 pr-14">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold-dark">Registro de auditoria</p>
            <h2 className="mt-1 text-[17px] font-semibold">{entry ? auditLabel(entry.action) : ""}</h2>
          </div>
        }
      >
        {entry && <Detail entry={entry} />}
      </SideSheet>
    </div>
  )
}
