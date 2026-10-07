"use client"

import * as React from "react"
import { Check, Link2, Scale } from "lucide-react"
import { toast } from "sonner"
import { Modal } from "@/components/ui/modal"
import { SearchField } from "@/components/ui/search-field"
import { EmptyState } from "@/components/ui/empty-state"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { matches } from "@/lib/core/format"
import { jurisApi } from "./api"

const VISIBLE = 30

/**
 * Escolher o processo do escritório para vincular a decisão. A lista vem dos processos
 * que já estão na tela (o servidor confere de novo: processo de outro escritório não existe).
 */
export function LinkDialog({
  decisionId,
  decisionLabel,
  open,
  onOpenChange,
  linkedIds,
  onLinked,
}: {
  decisionId: string
  decisionLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  linkedIds: string[]
  onLinked: (processId: string) => void
}) {
  const data = useOfficeData()
  const [query, setQuery] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const client = (id: string) => byId(data.clients, id)?.name
  const list = data.processes
    .filter((p) => matches(query, p.code, p.number, client(p.clientId), p.type, p.subject))
    .sort((a, b) => Number(a.status === "concluido") - Number(b.status === "concluido") || (b.lastMovementAt ?? "").localeCompare(a.lastMovementAt ?? ""))

  const link = async (processId: string) => {
    setBusy(processId)
    try {
      const { created } = await jurisApi.link(decisionId, processId)
      const code = byId(data.processes, processId)?.code
      toast.success(created ? "Jurisprudência vinculada ao processo." : "A decisão já estava vinculada.", { description: `${decisionLabel} → Processo ${code}` })
      onLinked(processId)
      onOpenChange(false)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Vincular ao processo" description={decisionLabel} icon={<Link2 />}>
      <SearchField value={query} onChange={setQuery} placeholder="Número, código, cliente ou assunto…" />
      {list.length === 0 ? (
        <EmptyState compact icon={<Scale />} title="Nenhum processo encontrado." description="Confira o número ou o nome do cliente." />
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-[12px] border border-border">
          {list.slice(0, VISIBLE).map((p) => {
            const linked = linkedIds.includes(p.id)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={linked || busy !== null}
                  onClick={() => void link(p.id)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">Processo {p.code}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{[client(p.clientId), p.subject ?? p.type].filter(Boolean).join(" · ")}</span>
                  </span>
                  {linked ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-success">
                      <Check className="size-3.5" /> Vinculada
                    </span>
                  ) : busy === p.id ? (
                    <span className="text-[12px] text-muted-foreground">Vinculando…</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {list.length > VISIBLE && <p className="mt-2 text-[12px] text-subtle">Mostrando {VISIBLE} de {list.length}. Refine a busca.</p>}
    </Modal>
  )
}
