"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Scale, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { CurrencyInput, Field, NativeSelect, TextInput } from "@/components/ui/field"
import { hasValidCheckDigits, maskCNJ, onlyDigits } from "@/lib/processos/cnj"
import { documentRequiredIssue } from "@/lib/clientes/clients"
import { PRACTICE_AREAS, PROCESS_STATUS } from "@/lib/core/config"
import { getMembers, currentUserId } from "@/lib/auth/account"
import { getNow, parse } from "@/lib/core/dates"
import { lookupProcess, type LookupFailure } from "@/lib/services/processos/client"
import { isAutoTracked } from "@/lib/services/processos/labels"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useRemovedWhileEditing } from "@/lib/store/on-demand"
import { byId } from "@/lib/store/indexes"
import type { PracticeArea, Process, ProcessStatus } from "@/types"
import { LookupFailed, LookupFound, LookupProgress, summaryFromProcess, summaryFromSheet, type LookupSummary } from "./process-lookup-status"
import { AUTO_REFRESH_AFTER_MS } from "./use-process-refresh"

export function NewProcessDialog({
  open,
  onOpenChange,
  clientId,
  number,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  clientId?: string
  /** Número já conhecido (ex.: de uma intimação): o formulário abre com ele. */
  number?: string
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo processo"
      description="Digite o CNJ e use o preenchimento automático, ou cadastre os dados à mão."
      icon={<Scale />}
      bare
    >
      <ProcessForm clientId={clientId} number={number} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

type Lookup =
  | { state: "idle" }
  | { state: "loading"; startedAt: number }
  /**
   * Consulta concluída: o processo já está salvo em Processos (`processId`).
   * `baseVersion`: versão do processo quando o formulário foi preenchido — se outra
   * pessoa alterar depois, "Salvar processo" é recusado em vez de sobrescrever.
   */
  | { state: "filled"; cnj: string; summary: LookupSummary; processId: string; existed: boolean; baseVersion: string | null }
  | { state: "error"; title: string; message: string; retry: boolean }

const ERROR_TITLE: Partial<Record<LookupFailure["reason"], string>> = {
  not_found: "Processo não encontrado",
  invalid: "Número inválido",
  unsupported: "Consulta automática indisponível",
  offline: "Sem conexão",
  forbidden: "Sem permissão para consultar",
  disabled: "Consulta automática desativada",
}

/** Campos do formulário a partir de um processo salvo. */
const pickForm = (existing: Process) => ({
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

/** Já salvo e atualizado há pouco: não precisa consultar de novo. */
const isRecent = (process: Process) => !!process.lastSyncedAt && getNow().getTime() - parse(process.lastSyncedAt).getTime() < AUTO_REFRESH_AFTER_MS

function ProcessForm({ clientId, number, onClose }: { clientId?: string; number?: string; onClose: () => void }) {
  const data = useOfficeData()
  const { addProcess, importProcess, updateProcess, applyProcessSync, ensureFullProcesses, versionOf } = useOfficeActions()
  const router = useRouter()
  const initial = () => ({
    number: number ? maskCNJ(number) : "",
    // Sem cliente pré-definido, começa "Sem cliente" — nunca vincula ao primeiro da lista por engano.
    clientId: clientId ?? "",
    area: "Cível" as PracticeArea,
    type: "",
    court: "",
    district: "Comarca da Capital — Florianópolis",
    opposingParty: "",
    ownerId: currentUserId(),
    status: "em_andamento" as ProcessStatus,
    claimValue: 0,
  })
  const [form, setForm] = React.useState(initial)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [lookup, setLookup] = React.useState<Lookup>({ state: "idle" })
  // Esperando o banco (código do processo, conferência de versão): evita cadastrar duas vezes.
  const [saving, setSaving] = React.useState(false)
  const abortRef = React.useRef<AbortController | null>(null)

  // Fechar o modal no meio da consulta encerra a espera (o servidor ainda guarda o resultado no cache).
  React.useEffect(() => () => abortRef.current?.abort(), [])

  const set = <K extends keyof ReturnType<typeof initial>>(k: K, v: ReturnType<typeof initial>[K]) => setForm((f) => ({ ...f, [k]: v }))

  const digits = onlyDigits(form.number)
  const loading = lookup.state === "loading"
  // O vínculo com o processo salvo só vale para o número consultado.
  const linked = lookup.state === "filled" && lookup.cnj === digits ? lookup : null
  useRemovedWhileEditing("processes", linked?.existed ? linked.processId : undefined)
  const findByCnj = (cnj: string) => data.processes.find((p) => (p.cnj ?? onlyDigits(p.number)) === cnj)
  // Contato sem CPF/CNPJ não pode ter processo vinculado (o banco também recusa, `0010_contacts.sql`).
  const clientIssue = documentRequiredIssue(byId(data.clients, form.clientId), "processo")

  const autofill = async () => {
    // A consulta já salva o processo com o cliente escolhido.
    if (clientIssue) return
    if (digits.length !== 20) {
      setErrors((e) => ({ ...e, number: "Digite os 20 dígitos do CNJ para preencher automaticamente." }))
      return
    }
    // Número impossível nem chega ao servidor.
    if (!hasValidCheckDigits(digits)) {
      setErrors((e) => ({ ...e, number: "O dígito verificador não confere. Confira o número do processo." }))
      return
    }

    const open = (id: string) => ({ label: "Abrir", onClick: () => router.push(`/processos/${id}`) })
    const known = findByCnj(digits)
    const formFrom = pickForm

    // Já está em Processos e foi atualizado há pouco: responde na hora, sem consulta.
    if (known && isRecent(known) && isAutoTracked(known.source?.provider)) {
      abortRef.current?.abort()
      setForm(formFrom(known))
      setErrors({})
      setLookup({
        state: "filled",
        cnj: digits,
        summary: summaryFromProcess(known),
        processId: known.id,
        existed: true,
        baseVersion: versionOf("processes", known.id),
      })
      toast.success("Esse processo já está em Processos.", { description: `${known.code} · informações em dia.`, action: open(known.id) })
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setErrors((e) => ({ ...e, number: "" }))
    setLookup({ state: "loading", startedAt: Date.now() })

    const result = await lookupProcess(form.number, controller.signal)
    if (controller.signal.aborted) return

    if (!result.ok) {
      setLookup({
        state: "error",
        title: ERROR_TITLE[result.reason] ?? "Não foi possível consultar o processo",
        // O título já diz que não deu; a mensagem só orienta o próximo passo.
        message: result.reason === "unavailable" ? "Tente novamente em alguns instantes." : result.message,
        retry: result.reason === "unavailable" || result.reason === "offline",
      })
      return
    }

    const found = result.sheet
    // O processo consultado é sempre salvo; o formulário só é preenchido se o
    // usuário não trocou o número enquanto a consulta rodava.
    const fillForm = (values: typeof form) => setForm((current) => (onlyDigits(current.number) === found.cnj ? values : current))

    const existing = findByCnj(found.cnj)

    if (existing) {
      // Já estava em Processos: atualiza e traz os dados do escritório para o formulário.
      // As novidades são comparadas com o histórico completo (a lista só tem a mais recente).
      try {
        await ensureFullProcesses([existing.id])
      } catch (error) {
        console.error("[processo] Não foi possível carregar o histórico:", error)
        setLookup({ state: "error", title: "Não foi possível consultar o processo", message: "Tente novamente em alguns instantes.", retry: true })
        return
      }
      if (controller.signal.aborted) return
      const baseVersion = versionOf("processes", existing.id)
      const { added } = applyProcessSync(existing.id, found, result.checkedAt)
      fillForm(formFrom(existing))
      setErrors({})
      setLookup({ state: "filled", cnj: found.cnj, summary: summaryFromSheet(found), processId: existing.id, existed: true, baseVersion })
      toast.success("Esse processo já estava em Processos.", {
        description: added
          ? `${existing.code} atualizado com ${added === 1 ? "1 nova movimentação" : `${added} novas movimentações`}.`
          : `${existing.code} já estava atualizado.`,
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
    const created = await importProcess(found, {
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
    // Não foi possível salvar (o aviso já apareceu): o formulário continua para tentar de novo.
    if (!created) {
      setLookup({ state: "idle" })
      return
    }
    fillForm(filled)
    setErrors({})
    setLookup({
      state: "filled",
      cnj: found.cnj,
      summary: summaryFromSheet(found),
      processId: created.id,
      existed: false,
      baseVersion: versionOf("processes", created.id),
    })
    toast.success("Processo salvo em Processos.", {
      description: `${created.code} · ${found.movements.length} movimentações importadas`,
      action: open(created.id),
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const next: Record<string, string> = {}
    if (digits.length !== 20) next.number = "Número CNJ deve ter 20 dígitos."
    if (form.type.trim().length < 3) next.type = "Informe o tipo de ação."
    const duplicate = !linked && digits.length === 20 ? findByCnj(digits) : undefined
    if (duplicate) next.number = `Esse processo já está em Processos (${duplicate.code}). Use “Preencher” para atualizá-lo.`
    setErrors(next)
    if (Object.values(next).some(Boolean) || clientIssue) return

    const open = (id: string) => ({ label: "Abrir", onClick: () => router.push(`/processos/${id}`) })

    // Consultado: o processo já existe — só grava os ajustes do formulário.
    if (linked) {
      setSaving(true)
      const patch = {
        clientId: form.clientId,
        area: form.area,
        type: form.type.trim(),
        court: form.court.trim() || "Não informado",
        district: form.district,
        opposingParty: form.opposingParty.trim() || "Não informado",
        ownerId: form.ownerId,
        status: form.status,
        claimValue: form.claimValue,
      }
      const result = await updateProcess(linked.processId, patch, { baseVersion: linked.baseVersion })
      setSaving(false)
      if (result.status === "conflict") {
        // Outra pessoa alterou: o formulário mostra o processo como está agora.
        setForm((current) => ({ ...current, ...pickForm(result.current) }))
        setLookup({ ...linked, baseVersion: versionOf("processes", linked.processId) })
        return
      }
      if (result.status === "error") return
      onClose()
      const saved = byId(data.processes, linked.processId)
      if (result.status === "saved" && saved)
        toast.success("Processo salvo.", { description: `${saved.code} · ${patch.type}`, action: open(saved.id) })
      return
    }

    setSaving(true)
    const process = await addProcess({
      ...form,
      court: form.court || "A definir",
      opposingParty: form.opposingParty || "A definir",
    })
    setSaving(false)
    if (!process) return
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
                onKeyDown={(e) => {
                  // Enter no número consulta, em vez de enviar o formulário incompleto.
                  if (e.key === "Enter" && digits.length === 20 && lookup.state !== "filled") {
                    e.preventDefault()
                    if (!loading) autofill()
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={autofill}
                disabled={loading || digits.length !== 20 || !!clientIssue}
                title="Buscar as informações do processo e preencher os campos"
              >
                {loading ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-foreground" aria-hidden />
                ) : (
                  <WandSparkles />
                )}
                {loading ? "Buscando…" : "Preencher"}
              </Button>
            </div>
          </Field>

          {lookup.state !== "idle" && (
            <div className="space-y-2 sm:col-span-2">
              {lookup.state === "loading" && <LookupProgress startedAt={lookup.startedAt} />}
              {linked && <LookupFound summary={linked.summary} existed={linked.existed} />}
              {lookup.state === "filled" && !linked && (
                <p className="text-[12.5px] text-muted-foreground">
                  O número mudou depois da consulta. O processo consultado continua salvo; este será cadastrado como um novo.
                </p>
              )}
              {lookup.state === "error" && (
                <LookupFailed title={lookup.title} message={lookup.message} onRetry={lookup.retry ? autofill : undefined} />
              )}
            </div>
          )}

          <Field label="Cliente" htmlFor="proc-client" optional error={clientIssue}>
            <NativeSelect id="proc-client" value={form.clientId} aria-invalid={!!clientIssue} onChange={(e) => set("clientId", e.target.value)}>
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
              {getMembers().map((u) => (
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
        <Button type="submit" form="process-form" disabled={loading || saving}>
          {linked ? "Salvar processo" : "Cadastrar processo"}
        </Button>
      </ModalFooter>
    </>
  )
}
