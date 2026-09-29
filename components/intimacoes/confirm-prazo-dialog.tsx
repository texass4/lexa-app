"use client"

import * as React from "react"
import { Hourglass } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useSession } from "@/lib/auth/session"
import { currentUserId, getMembers } from "@/lib/account"
import { fmtNumericDate } from "@/lib/dates"
import { validatePrazo, type PrazoErrors } from "@/lib/prazos"
import { suggestDeadline } from "@/lib/intimacoes/deadline"
import { subtractBusinessDays } from "@/lib/intimacoes/calendar"
import type { Intimacao } from "@/types"
import { useIntimacoes } from "./intimacoes-provider"

/**
 * Intimação → sugestão → o advogado confere e confirma → Prazo (Etapa 4, com a tarefa
 * vinculada). Nada é criado sem este passo. Ajustar os dias recalcula a data fatal
 * pelas mesmas regras; a data continua editável (feriado local, por exemplo).
 */
export function ConfirmPrazoDialog({ intimacao, onOpenChange }: { intimacao?: Intimacao; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal
      open={!!intimacao}
      onOpenChange={onOpenChange}
      title="Confirmar prazo"
      description="Confira a sugestão antes de criar o prazo."
      icon={<Hourglass />}
      bare
    >
      {intimacao && <ConfirmForm intimacao={intimacao} onClose={() => onOpenChange(false)} />}
    </Modal>
  )
}

function ConfirmForm({ intimacao, onClose }: { intimacao: Intimacao; onClose: () => void }) {
  const data = useDemoData()
  const { addPrazo } = useDemoActions()
  const { markConfirmed } = useIntimacoes()
  const { can } = useSession()
  const canTask = can("tasks.edit")
  const suggestion = intimacao.suggestion
  const process = data.processes.find((p) => p.id === intimacao.processId)
  const federal = /^TRF/i.test(intimacao.tribunal ?? "")

  const [days, setDays] = React.useState(suggestion?.days ? String(suggestion.days) : "")
  const [unit, setUnit] = React.useState<"uteis" | "corridos">(suggestion?.unit ?? "uteis")
  const initialFatal = suggestion?.fatalDate ?? ""
  const [form, setForm] = React.useState(() => ({
    description: `${intimacao.tipoDocumento ?? intimacao.tipoComunicacao ?? "Intimação"} — DJEN ${fmtNumericDate(intimacao.publishedAt ?? intimacao.availableAt)}`,
    fatalDate: initialFatal,
    internalDate: initialFatal ? subtractBusinessDays(initialFatal, 2, { federal }) : "",
    internalDateReason: "",
    responsibleId: intimacao.responsibleId ?? process?.ownerId ?? currentUserId(),
    createTask: canTask,
  }))
  const [errors, setErrors] = React.useState<PrazoErrors>({})
  const [saving, setSaving] = React.useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  // Dias informados pelo advogado: mesma regra de contagem da sugestão.
  const recompute = (nextDays: string, nextUnit: "uteis" | "corridos") => {
    const n = Number(nextDays)
    if (!Number.isInteger(n) || n <= 0 || n > 365) return
    const s = suggestDeadline({
      availableAt: intimacao.availableAt,
      text: intimacao.content,
      tribunal: intimacao.tribunal,
      classe: intimacao.classe,
      days: n,
      unit: nextUnit,
    })
    if (s.fatalDate) setForm((f) => ({ ...f, fatalDate: s.fatalDate!, internalDate: subtractBusinessDays(s.fatalDate!, 2, { federal }) }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || !process) return
    const input = {
      processId: process.id,
      description: form.description,
      fatalDate: form.fatalDate,
      internalDate: form.internalDate,
      internalDateReason: form.internalDateReason,
      responsibleId: form.responsibleId,
      origin: "intimacao",
    }
    const next = validatePrazo(input)
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    // Um prazo por intimação (o banco garante): se já existe, só conclui a triagem.
    const existing = data.deadlines.find((d) => d.intimacaoId === intimacao.id)
    const prazo =
      existing ?? (await addPrazo({ ...input, origin: "intimacao", intimacaoId: intimacao.id }, { createTask: form.createTask && canTask }))
    if (!prazo) {
      setSaving(false)
      return
    }
    const result = await markConfirmed(intimacao, prazo.id)
    setSaving(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    onClose()
    toast.success("Prazo criado.", { description: `${prazo.description} · fatal em ${fmtNumericDate(prazo.fatalDate)}` })
  }

  if (!process) {
    return (
      <ModalBody>
        <p className="text-[13px] text-muted-foreground">Vincule a intimação a um processo antes de confirmar o prazo.</p>
      </ModalBody>
    )
  }

  return (
    <>
      <ModalBody>
        <form id="confirm-prazo" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-[10px] border border-border bg-surface-muted/40 px-3 py-2.5 text-[12.5px] sm:col-span-2">
            <p className="font-medium text-foreground">
              Processo {process.code} · publicada em {fmtNumericDate(suggestion?.publishedAt ?? intimacao.publishedAt ?? intimacao.availableAt)}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {suggestion?.daysSource === "teor" && suggestion.excerpt
                ? `No teor: “${suggestion.excerpt}”`
                : "O número de dias não veio do teor: informe abaixo."}
            </p>
          </div>
          <Field label="Descrição" htmlFor="cp-description" error={errors.description} className="sm:col-span-2">
            <TextInput
              id="cp-description"
              value={form.description}
              aria-invalid={!!errors.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field label="Prazo (dias)" htmlFor="cp-days" hint="Recalcula a data fatal pelas regras da sugestão.">
            <TextInput
              id="cp-days"
              inputMode="numeric"
              value={days}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 3)
                setDays(value)
                recompute(value, unit)
              }}
            />
          </Field>
          <Field label="Contagem" htmlFor="cp-unit">
            <NativeSelect
              id="cp-unit"
              value={unit}
              onChange={(e) => {
                const value = e.target.value as "uteis" | "corridos"
                setUnit(value)
                recompute(days, value)
              }}
            >
              <option value="uteis">Dias úteis (CPC, art. 219)</option>
              <option value="corridos">Dias corridos</option>
            </NativeSelect>
          </Field>
          <Field label="Data fatal" htmlFor="cp-fatal" error={errors.fatalDate}>
            <TextInput
              id="cp-fatal"
              type="date"
              value={form.fatalDate}
              aria-invalid={!!errors.fatalDate}
              onChange={(e) => set("fatalDate", e.target.value)}
            />
          </Field>
          <Field label="Data interna" htmlFor="cp-internal" error={errors.internalDate} hint="Até quando o escritório quer concluir.">
            <TextInput
              id="cp-internal"
              type="date"
              value={form.internalDate}
              aria-invalid={!!errors.internalDate}
              onChange={(e) => set("internalDate", e.target.value)}
            />
          </Field>
          {errors.internalDateReason && (
            <Field
              label="Por que a data interna fica depois da fatal?"
              htmlFor="cp-reason"
              error={errors.internalDateReason}
              className="sm:col-span-2"
            >
              <TextInput id="cp-reason" value={form.internalDateReason} onChange={(e) => set("internalDateReason", e.target.value)} />
            </Field>
          )}
          <Field label="Responsável" htmlFor="cp-responsible" error={errors.responsibleId} className="sm:col-span-2">
            <NativeSelect id="cp-responsible" value={form.responsibleId} onChange={(e) => set("responsibleId", e.target.value)}>
              {getMembers().map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-muted/40 px-3 py-2.5 sm:col-span-2">
            <AnimatedCheckbox
              className="mt-0.5"
              checked={form.createTask}
              disabled={!canTask}
              label="Criar tarefa para este prazo"
              onChange={() => set("createTask", !form.createTask)}
            />
            <span className="text-[13px]">
              <span className="font-medium text-foreground">Criar tarefa para este prazo</span>
              <span className="block text-[12px] text-muted-foreground">
                {canTask
                  ? "Na data interna, para o responsável, vinculada ao processo."
                  : "Você não tem permissão para criar tarefas; o prazo ficará sem tarefa."}
              </span>
            </span>
          </label>
          {suggestion?.caveat && <p className="text-[11.5px] leading-relaxed text-subtle sm:col-span-2">{suggestion.caveat}</p>}
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="confirm-prazo" disabled={saving}>
          {saving ? "Criando…" : "Confirmar e criar prazo"}
        </Button>
      </ModalFooter>
    </>
  )
}
