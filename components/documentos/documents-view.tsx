"use client"

import * as React from "react"
import Link from "next/link"
import { FilePlus, FolderOpen } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/ui/user-avatar"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { FadeIn } from "@/components/ui/motion"
import { NativeSelect } from "@/components/ui/field"
import { FileIcon } from "@/components/shared/file-icon"
import { DocumentActions, DocumentList } from "@/components/shared/document-list"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { fmtNumericDate } from "@/lib/dates"
import { formatFileSize, matches } from "@/lib/format"
import { getUser } from "@/lib/account"
import type { DocumentKind } from "@/types"

type Filter = "todos" | "Contrato" | "Procuração" | "Petição" | "Documento pessoal" | "Laudo" | "outros"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "Contrato", label: "Contratos" },
  { value: "Procuração", label: "Procurações" },
  { value: "Petição", label: "Petições" },
  { value: "Documento pessoal", label: "Pessoais" },
  { value: "Laudo", label: "Laudos" },
  { value: "outros", label: "Outros" },
]

const MAIN_KINDS: DocumentKind[] = ["Contrato", "Procuração", "Petição", "Documento pessoal", "Laudo"]

export function DocumentsView() {
  const data = useDemoData()
  const { openDialog } = useUI()
  const ready = data.hydrated
  const [filter, setFilter] = React.useState<Filter>("todos")
  const [clientId, setClientId] = React.useState("")
  const [query, setQuery] = React.useState("")

  const test = (f: Filter, kind: DocumentKind) => (f === "todos" ? true : f === "outros" ? !MAIN_KINDS.includes(kind) : kind === f)

  const rows = data.documents
    .filter((d) => test(filter, d.kind) && (!clientId || d.clientId === clientId))
    .filter((d) => {
      const client = data.clients.find((c) => c.id === d.clientId)
      const process = data.processes.find((p) => p.id === d.processId)
      return matches(query, d.name, d.kind, client?.name, process?.number, process?.code)
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))

  const totalSize = data.documents.reduce((acc, d) => acc + d.sizeBytes, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        description={`${data.documents.length} arquivos · ${formatFileSize(totalSize)} armazenados com criptografia.`}
        actions={
          <Button onClick={() => openDialog("document")}>
            <FilePlus /> Novo documento
          </Button>
        }
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs
          ariaLabel="Filtrar por tipo"
          layoutId="docs-filter"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, count: data.documents.filter((d) => test(f.value, d.kind)).length }))}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="sm:w-[200px]">
            <NativeSelect aria-label="Filtrar por cliente" value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9 text-[13px]">
              <option value="">Todos os clientes</option>
              {data.clients
                .filter((c) => data.documents.some((d) => d.clientId === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <SearchField value={query} onChange={setQuery} placeholder="Buscar documento…" className="w-full sm:w-[260px]" />
        </div>
      </div>

      {!ready ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <TableShell>
          <EmptyState
            icon={<FolderOpen />}
            title="Nenhum documento encontrado."
            description="Adicione contratos, procurações e peças para centralizar os arquivos do escritório."
            action={
              <Button size="sm" onClick={() => openDialog("document")}>
                <FilePlus /> Novo documento
              </Button>
            }
          />
        </TableShell>
      ) : (
        <FadeIn>
          <TableShell className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>Cliente</Th>
                    <Th>Processo</Th>
                    <Th>Tipo</Th>
                    <Th>Data</Th>
                    <Th className="max-lg:hidden">Responsável</Th>
                    <Th className="w-10" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child_td]:border-0">
                  {rows.map((d) => {
                    const client = data.clients.find((c) => c.id === d.clientId)
                    const process = data.processes.find((p) => p.id === d.processId)
                    const by = getUser(d.uploadedById)
                    return (
                      <tr key={d.id} className="transition-colors hover:bg-accent/40">
                        <Td>
                          <div className="flex items-center gap-3">
                            <FileIcon extension={d.extension} className="h-9 w-7" />
                            <div className="min-w-0">
                              <p className="max-w-[300px] truncate font-medium">{d.name}</p>
                              <p className="text-[11.5px] text-subtle">{formatFileSize(d.sizeBytes)}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          {client ? (
                            <Link href={`/clientes/${client.id}?tab=documentos`} className="max-w-[160px] truncate text-foreground hover:underline">
                              {client.name}
                            </Link>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </Td>
                        <Td>
                          {process ? (
                            <Link
                              href={`/processos/${process.id}`}
                              className="font-mono text-[12px] text-muted-foreground hover:text-foreground hover:underline"
                            >
                              {process.code}
                            </Link>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </Td>
                        <Td className="text-muted-foreground">{d.kind}</Td>
                        <Td className="tabular whitespace-nowrap text-muted-foreground">{fmtNumericDate(d.uploadedAt)}</Td>
                        <Td className="max-lg:hidden">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <UserAvatar name={by.name} size="xs" />
                            {by.firstName}
                          </span>
                        </Td>
                        <Td>
                          <DocumentActions doc={d} />
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </TableShell>
          <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-card md:hidden">
            <DocumentList documents={rows} showClient />
          </div>
        </FadeIn>
      )}
    </div>
  )
}
