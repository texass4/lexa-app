"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FileSearch, Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Field, TextInput } from "@/components/ui/field"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { hasValidCheckDigits, maskCNJ, onlyDigits } from "@/lib/processos/cnj"
import { processNumberLabel, processTitle } from "@/lib/processos/label"
import { matches } from "@/lib/core/format"
import { byId } from "@/lib/store/indexes"
import { useOfficeData } from "@/lib/store/office-store"
import { consultaHref, startConsulta } from "@/lib/services/consulta/client"
import type { Process } from "@/types"

const MODES = ["Número CNJ", "Processo cadastrado"] as const
type Mode = (typeof MODES)[number]

const cnjOf = (p: Process) => {
  const digits = p.cnj ?? onlyDigits(p.number ?? "")
  return digits.length === 20 && hasValidCheckDigits(digits) ? digits : undefined
}

/** Inicia a consulta e abre a página que acompanha as etapas. */
export function useStartConsulta() {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const start = React.useCallback(
    async (input: { processId?: string; cnj?: string; force?: boolean }) => {
      if (pending) return false
      setPending(true)
      const result = await startConsulta(input)
      setPending(false)
      if (!result.ok) {
        toast.error("Não foi possível iniciar a consulta.", { description: result.message })
        return false
      }
      router.push(consultaHref(result.runId))
      return true
    },
    [pending, router],
  )
  return { start, pending }
}

/** Número CNJ ou processo do cadastro → consulta. */
export function StartConsultaForm({ onStarted, autoFocus = true, className }: { onStarted?: () => void; autoFocus?: boolean; className?: string }) {
  const data = useOfficeData()
  const { start, pending } = useStartConsulta()
  const [mode, setMode] = React.useState<Mode>("Número CNJ")
  const [number, setNumber] = React.useState("")
  const [error, setError] = React.useState("")
  const [query, setQuery] = React.useState("")

  const candidates = React.useMemo(() => {
    const clientName = (id?: string) => byId(data.clients, id)?.name
    return data.processes
      .filter((p) => cnjOf(p))
      .filter((p) => !query.trim() || matches(query, p.number, p.code, p.type, p.className, clientName(p.clientId)))
      .slice(0, 8)
      .map((p) => ({ process: p, title: processTitle(p, clientName(p.clientId)) }))
  }, [data.processes, data.clients, query])

  const submitNumber = async (e: React.FormEvent) => {
    e.preventDefault()
    const digits = onlyDigits(number)
    if (digits.length !== 20) return setError("Digite os 20 dígitos do número CNJ.")
    if (!hasValidCheckDigits(digits)) return setError("O dígito verificador não confere. Confira o número do processo.")
    if (await start({ cnj: digits })) onStarted?.()
  }

  return (
    <div className={cn("space-y-4", className)}>
      <ChoiceChips ariaLabel="Consultar por" options={MODES} value={mode} onChange={setMode} />
      {mode === "Número CNJ" ? (
        <form onSubmit={submitNumber} className="space-y-3" noValidate>
          <Field
            label="Número do processo (CNJ)"
            htmlFor="consulta-cnj"
            error={error || undefined}
            hint="Consulta pública: só informações que as fontes oficiais disponibilizam."
          >
            <div className="flex gap-2">
              <TextInput
                id="consulta-cnj"
                autoFocus={autoFocus}
                inputMode="numeric"
                className="min-w-0 flex-1 font-mono"
                placeholder="0000000-00.2026.8.24.0001"
                value={number}
                aria-invalid={!!error}
                onChange={(e) => {
                  setNumber(maskCNJ(e.target.value))
                  setError("")
                }}
              />
              <Button type="submit" disabled={pending} className="shrink-0">
                <FileSearch /> {pending ? "Iniciando…" : "Consultar"}
              </Button>
            </div>
          </Field>
        </form>
      ) : (
        <div className="space-y-3">
          <Field label="Processo do escritório" htmlFor="consulta-busca" hint="Só processos com número CNJ aparecem aqui.">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <TextInput
                id="consulta-busca"
                autoFocus={autoFocus}
                className="pl-9"
                placeholder="Cliente, número ou tipo de ação…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </Field>
          {candidates.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">
              {candidates.map(({ process, title }) => (
                <li key={process.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={async () => {
                      if (await start({ processId: process.id })) onStarted?.()
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
                      <span className="tabular block truncate text-[11.5px] text-muted-foreground">{processNumberLabel(process)}</span>
                    </span>
                    <FileSearch className="size-4 shrink-0 text-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Nenhum processo com número CNJ encontrado.</p>
          )}
        </div>
      )}
    </div>
  )
}

export function StartConsultaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Consultar processo"
      description="Reúne o que as fontes oficiais informam sobre o processo, com a fonte e a data de cada dado."
      icon={<FileSearch />}
      bare
    >
      <ModalBody>
        <StartConsultaForm onStarted={() => onOpenChange(false)} />
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </ModalFooter>
    </Modal>
  )
}
