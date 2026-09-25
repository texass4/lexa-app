"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CircleAlert, CircleCheck, Scale, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { CurrencyInput, Field, NativeSelect, TextInput } from "@/components/ui/field"
import { hasValidCheckDigits, maskCNJ, onlyDigits } from "@/lib/cnj"
import { PRACTICE_AREAS, PROCESS_STATUS } from "@/lib/config"
import { users, CURRENT_USER_ID } from "@/lib/account"
import { searchProcessByCNJ } from "@/lib/services/processes/client"
import type { ProcessSheet } from "@/lib/services/processes/sheet"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import type { PracticeArea, ProcessStatus } from "@/types"
import { LookupLog, makeLogAppender, useElapsed, type LogEntry } from "./lookup-log"

export function NewProcessDialog({ open, onOpenChange, clientId }: { open: boolean; onOpenChange: (o: boolean) => void; clientId?: string }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo processo"
      description="Digite o CNJ e use o preenchimento automático, ou cadastre os dados à mão."
      icon={<Scale />}
      bare
    >
      <ProcessForm clientId={clientId} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

type Lookup =
  | { state: "idle" }
  | { state: "loading"; startedAt: number }
  /** Consulta concluída: o processo já está salvo em Processos (`processId`). */
  | { state: "filled"; sheet: ProcessSheet; processId: string; existed: boolean }
  | { state: "error"; title: string; message: string; detail?: string }

function lookupErrorTitle(code: string) {
  if (code === "NOT_FOUND") return "Processo não encontrado no DataJud"
  if (code === "INVALID_CNJ") return "Número inválido"
  if (code === "RATE_LIMIT") return "Consulta limitada pelo DataJud"
  if (code === "TIMEOUT") return "O DataJud demorou demais"
  if (code === "UNAVAILABLE") return "DataJud instável"
  if (code === "UNSUPPORTED_COURT") return "Tribunal ainda não suportado"
  return "Não foi possível consultar"
}

function ProcessForm({ clientId, onClose }: { clientId?: string; onClose: () => void }) {
  const data = useDemoData()
  const { addProcess, importProcess, updateProcess, applyProcessSync } = useDemoActions()
  const router = useRouter()
  const initial = () => ({
    number: "",
    clientId: clientId ?? data.clients[0]?.id ?? "",
    area: "Cível" as PracticeArea,
    type: "",
    court: "",
    district: "Comarca da Capital — Florianópolis",
    opposingParty: "",
    ownerId: CURRENT_USER_ID,
    status: "em_andamento" as ProcessStatus,
    claimValue: 0,
  })
  const [form, setForm] = React.useState(initial)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [lookup, setLookup] = React.useState<Lookup>({ state: "idle" })
  const [log, setLog] = React.useState<LogEntry[]>([])
  const abortRef = React.useRef<AbortController | null>(null)
  const elapsed = useElapsed(lookup.state === "loading" ? lookup.startedAt : null, lookup.state === "loading")

  // Fechar o modal no meio da consulta encerra a requisição (e o script).
  React.useEffect(() => () => abortRef.current?.abort(), [])

  const set = <K extends keyof ReturnType<typeof initial>>(k: K, v: ReturnType<typeof initial>[K]) => setForm((f) => ({ ...f, [k]: v }))

  const digits = onlyDigits(form.number)
  const loading = lookup.state === "loading"
  // O vínculo com o processo salvo só vale para o número consultado.
  const linked = lookup.state === "filled" && lookup.sheet.cnj === digits ? lookup : null
  const findByCnj = (cnj: string) => data.processes.find((p) => (p.cnj ?? onlyDigits(p.number)) === cnj)

  const autofill = async () => {
    if (digits.length !== 20) {
      setErrors((e) => ({ ...e, number: "Digite os 20 dígitos do CNJ para preencher automaticamente." }))
      return
    }
    // Número impossível nem chega ao servidor.
    if (!hasValidCheckDigits(digits)) {
      setErrors((e) => ({ ...e, number: "O dígito verificador não confere. Confira o número do processo." }))
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = Date.now()
    setErrors((e) => ({ ...e, number: "" }))
    setLog([])
    setLookup({ state: "loading", startedAt })

    const result = await searchProcessByCNJ(
      form.number,
      makeLogAppender(startedAt, (entry) => setLog((current) => [...current, entry])),
      controller.signal,
    )
    if (controller.signal.aborted) return

    if (!result.ok) {
      setLookup({ state: "error", title: lookupErrorTitle(result.code), message: result.message, detail: result.detail })
      return
    }

    const found = result.sheet
    // O processo consultado é sempre salvo; o formulário só é preenchido se o
    // usuário não trocou o número enquanto a consulta rodava.
    const fillForm = (values: typeof form) => setForm((current) => (onlyDigits(current.number) === found.cnj ? values : current))

    const open = (id: string) => ({ label: "Abrir", onClick: () => router.push(`/processos/${id}`) })
    const existing = findByCnj(found.cnj)

    if (existing) {
      // Já estava em Processos: atualiza com a fonte e traz os dados do escritório para o formulário.
      const { added } = applyProcessSync(existing.id, found)
      fillForm({
        number: existing.number,
        clientId: existing.clientId,
        area: existing.area,
        type: existing.type,
        court: existing.court,
        district: existing.district,
        opposingParty: existing.opposingParty,
        ownerId: existing.ownerId,
        status: existing.status,
        claimValue: existing.claimValue,
      })
      setErrors({})
      setLookup({ state: "filled", sheet: found, processId: existing.id, existed: true })
      toast.success("Esse processo já estava em Processos.", {
        description: added ? `${existing.code} atualizado com ${added} nova(s) movimentação(ões).` : `${existing.code} já estava em dia com o DataJud.`,
        action: open(existing.id),
      })
      return
    }

    // Consulta nova: o processo é salvo imediatamente com o que já está no formulário.
    const area = PRACTICE_AREAS.find((a) => a === found.subject) ?? form.area
    const filled = {
      ...form,
      number: found.number,
      type: found.className ?? found.subject ?? form.type,
      court: found.judicialUnit ?? form.court,
      district: found.tribunal ?? form.district,
      opposingParty: found.parties.passive[0]?.name ?? form.opposingParty,
      area,
    }
    const created = importProcess(found, {
      clientId: filled.clientId,
      ownerId: filled.ownerId,
      area: filled.area,
      status: filled.status,
      claimValue: filled.claimValue,
      district: filled.district,
      type: filled.type,
      court: filled.court,
      opposingParty: filled.opposingParty || undefined,
    })
    fillForm(filled)
    setErrors({})
    setLookup({ state: "filled", sheet: found, processId: created.id, existed: false })
    toast.success("Processo salvo em Processos.", {
      description: `${created.code} · ${found.movements.length} movimentações importadas`,
      action: open(created.id),
    })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (digits.length !== 20) next.number = "Número CNJ deve ter 20 dígitos."
    if (form.type.trim().length < 3) next.type = "Informe o tipo de ação."
    const duplicate = !linked && digits.length === 20 ? findByCnj(digits) : undefined
    if (duplicate) next.number = `Esse processo já está em Processos (${duplicate.code}). Use “Preencher” para atualizá-lo.`
    setErrors(next)
    if (Object.values(next).some(Boolean)) return

    const open = (id: string) => ({ label: "Abrir", onClick: () => router.push(`/processos/${id}`) })

    // Consultado: o processo já existe — só grava os ajustes do formulário.
    if (linked) {
      const updated = updateProcess(linked.processId, {
        clientId: form.clientId,
        area: form.area,
        type: form.type.trim(),
        court: form.court.trim() || "Não informado pela fonte",
        district: form.district,
        opposingParty: form.opposingParty.trim() || "Não informado pela fonte",
        ownerId: form.ownerId,
        status: form.status,
        claimValue: form.claimValue,
      })
      onClose()
      if (updated) toast.success("Processo salvo.", { description: `${updated.code} · ${updated.type}`, action: open(updated.id) })
      return
    }

    const process = addProcess({
      ...form,
      court: form.court || "A definir",
      opposingParty: form.opposingParty || "A definir",
    })
    onClose()
    toast.success("Processo cadastrado.", { description: `${process.code} · ${process.type}`, action: open(process.id) })
  }

  return (
    <>
      <ModalBody>
        <form id="process-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Número (CNJ)" htmlFor="proc-number" error={errors.number || undefined} className="sm:col-span-2">
            <div className="flex gap-2">
              <TextInput
                id="proc-number"
                autoFocus
                inputMode="numeric"
                className="min-w-0 flex-1 font-mono"
                placeholder="0000000-00.2026.8.24.0001"
                value={form.number}
                aria-invalid={!!errors.number}
                onChange={(e) => {
                  set("number", maskCNJ(e.target.value))
                  if (lookup.state === "error") setLookup({ state: "idle" })
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={autofill}
                disabled={loading || digits.length !== 20}
                title="Buscar o processo no DataJud e preencher os campos"
              >
                {loading ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-foreground" aria-hidden />
                ) : (
                  <WandSparkles />
                )}
                {loading ? `${elapsed}s` : "Preencher"}
              </Button>
            </div>
          </Field>

          {lookup.state !== "idle" && (
            <div className="space-y-2 sm:col-span-2">
              {lookup.state === "loading" && <p className="text-[12.5px] text-muted-foreground">Consultando o processo no DataJud…</p>}

              {linked && (
                <div className="flex items-start gap-2.5 rounded-[10px] border border-success/25 bg-success-soft/50 px-3 py-2.5">
                  <CircleCheck className="mt-px size-4 shrink-0 text-success" />
                  <p className="min-w-0 text-[12.5px] leading-snug text-muted-foreground">
                    <span className="font-medium text-foreground">{linked.existed ? "Já estava em Processos — atualizado." : "Salvo em Processos."}</span>{" "}
                    {[linked.sheet.tribunal, linked.sheet.degree, `${linked.sheet.movements.length} movimentações`].filter(Boolean).join(" · ")}. Ajuste
                    cliente e responsável e clique em salvar.
                  </p>
                </div>
              )}

              {lookup.state === "filled" && !linked && (
                <p className="text-[12.5px] text-muted-foreground">
                  O número mudou depois da consulta. O processo consultado continua salvo; este será cadastrado como um novo.
                </p>
              )}

              {lookup.state === "error" && (
                <div className="flex items-start gap-2.5 rounded-[10px] border border-danger/25 bg-danger-soft/50 px-3 py-2.5">
                  <CircleAlert className="mt-px size-4 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground">{lookup.title}</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{lookup.message} Você pode preencher os campos manualmente.</p>
                    {lookup.detail && <p className="mt-1 font-mono text-[11.5px] leading-snug break-words text-subtle">{lookup.detail}</p>}
                  </div>
                </div>
              )}

              {(loading || lookup.state === "error") && <LookupLog entries={log} />}
            </div>
          )}

          <Field label="Cliente" htmlFor="proc-client" optional>
            <NativeSelect id="proc-client" value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">Sem cliente</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Área" htmlFor="proc-area">
            <NativeSelect id="proc-area" value={form.area} onChange={(e) => set("area", e.target.value as PracticeArea)}>
              {PRACTICE_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Tipo de ação" htmlFor="proc-type" error={errors.type} className="sm:col-span-2">
            <TextInput
              id="proc-type"
              placeholder="Ex.: Ação de indenização por danos morais"
              value={form.type}
              aria-invalid={!!errors.type}
              onChange={(e) => set("type", e.target.value)}
            />
          </Field>
          <Field label="Vara / Juízo" htmlFor="proc-court" optional>
            <TextInput id="proc-court" placeholder="Ex.: 3ª Vara Cível" value={form.court} onChange={(e) => set("court", e.target.value)} />
          </Field>
          <Field label="Parte contrária" htmlFor="proc-opposing" optional>
            <TextInput id="proc-opposing" value={form.opposingParty} onChange={(e) => set("opposingParty", e.target.value)} />
          </Field>
          <Field label="Responsável" htmlFor="proc-owner">
            <NativeSelect id="proc-owner" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="proc-status">
            <NativeSelect id="proc-status" value={form.status} onChange={(e) => set("status", e.target.value as ProcessStatus)}>
              {Object.entries(PROCESS_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Valor da causa" htmlFor="proc-value" optional className="sm:col-span-2">
            <CurrencyInput id="proc-value" value={form.claimValue} onChange={(v) => set("claimValue", v)} />
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          {linked ? "Fechar" : "Cancelar"}
        </Button>
        <Button type="submit" form="process-form" disabled={loading}>
          {linked ? "Salvar processo" : "Cadastrar processo"}
        </Button>
      </ModalFooter>
    </>
  )
}
