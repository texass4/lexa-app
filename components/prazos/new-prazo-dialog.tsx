"use client"

import * as React from "react"
import { Hourglass } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { currentUserId, getMembers } from "@/lib/auth/account"
import { useSession } from "@/lib/auth/session"
import { PRAZO_ORIGIN } from "@/lib/core/config"
import { fmtNumericDate } from "@/lib/core/dates"
import { internalAfterFatal, validatePrazo, type PrazoErrors } from "@/lib/prazos/prazos"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import type { PrazoOrigin } from "@/types"
import { processNumberLabel, processTitle } from "@/lib/processos/label"

type Defaults = { processId?: string }

const ORIGIN_LABELS = [PRAZO_ORIGIN.manual, PRAZO_ORIGIN.intimacao] as const
const toOrigin: Record<(typeof ORIGIN_LABELS)[number], PrazoOrigin> = { [PRAZO_ORIGIN.manual]: "manual", [PRAZO_ORIGIN.intimacao]: "intimacao" }

function PrazoForm({ defaults, onClose }: { defaults?: Defaults; onClose: () => void }) {
  const data = useOfficeData()
  const { addPrazo } = useOfficeActions()
  const { can } = useSession()
  const canTask = can("tasks.edit")
  // Aberto pelo processo: processo (e cliente) já vêm definidos.
  const fixedProcess = defaults?.processId ? byId(data.processes, defaults.processId) : undefined

  const [form, setForm] = React.useState(() => ({
    processId: fixedProcess?.id ?? "",
    description: "",
    fatalDate: "",
    internalDate: "",
    internalDateReason: "",
    responsibleId: currentUserId(),
    origin: PRAZO_ORIGIN.manual as (typeof ORIGIN_LABELS)[number],
    createTask: canTask,
  }))
  const [errors, setErrors] = React.useState<PrazoErrors>({})
  const [saving, setSaving] = React.useState(false)

  type FormState = typeof form
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const process = byId(data.processes, form.processId)
  const client = process ? byId(data.clients, process.clientId) : undefined
  const needsReason = internalAfterFatal(form)
  const responsible = getMembers().find((m) => m.id === form.responsibleId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const input = {
      processId: form.processId,
      description: form.description,
      fatalDate: form.fatalDate,
      internalDate: form.internalDate,
      internalDateReason: needsReason ? form.internalDateReason : undefined,
      responsibleId: form.responsibleId,
      origin: toOrigin[form.origin],
    }
    const found = validatePrazo(input)
    setErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    const prazo = await addPrazo({ ...input, origin: toOrigin[form.origin] }, { createTask: form.createTask && canTask })
    setSaving(false)
    // Não gravou (o aviso já apareceu): o formulário continua para tentar de novo.
    if (!prazo) return
    onClose()
    toast.success("Prazo cadastrado.", {
      description: prazo.taskId
        ? `Tarefa criada para ${responsible?.firstName ?? "o responsável"} em ${fmtNumericDate(prazo.internalDate)}.`
        : `${prazo.description} · fatal em ${fmtNumericDate(prazo.fatalDate)}`,
    })
  }

  const processes = data.processes.filter((p) => p.status !== "concluido" || p.id === form.processId)

  return (
    <>
      <ModalBody>
        <form id="prazo-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field
            label="Processo"
            htmlFor="prazo-process"
            error={errors.processId}
            hint={client ? `Cliente: ${client.name}` : undefined}
            className="sm:col-span-2"
          >
            <NativeSelect
              id="prazo-process"
              value={form.processId}
              disabled={!!fixedProcess}
              aria-invalid={!!errors.processId}
              onChange={(e) => set("processId", e.target.value)}
            >
              <option value="">Escolha o processo</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {processTitle(p, byId(data.clients, p.clientId)?.name)} · {processNumberLabel(p)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Descrição" htmlFor="prazo-description" error={errors.description} className="sm:col-span-2">
            <TextInput
              id="prazo-description"
              autoFocus
              maxLength={500}
              placeholder="Ex.: Contestação"
              value={form.description}
              aria-invalid={!!errors.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field label="Data fatal" htmlFor="prazo-fatal" error={errors.fatalDate} hint="Último dia para cumprir.">
            <TextInput
              id="prazo-fatal"
              type="date"
              value={form.fatalDate}
              aria-invalid={!!errors.fatalDate}
              onChange={(e) => set("fatalDate", e.target.value)}
            />
          </Field>
          <Field label="Data interna" htmlFor="prazo-internal" error={errors.internalDate} hint="Até quando o escritório quer concluir.">
            <TextInput
              id="prazo-internal"
              type="date"
              value={form.internalDate}
              aria-invalid={!!errors.internalDate}
              onChange={(e) => set("internalDate", e.target.value)}
            />
          </Field>
          {needsReason && (
            <Field
              label="Por que a data interna fica depois da fatal?"
              htmlFor="prazo-reason"
              error={errors.internalDateReason}
              className="sm:col-span-2"
            >
              <TextArea
                id="prazo-reason"
                rows={2}
                value={form.internalDateReason}
                aria-invalid={!!errors.internalDateReason}
                onChange={(e) => set("internalDateReason", e.target.value)}
              />
            </Field>
          )}
          <Field label="Responsável" htmlFor="prazo-responsible" error={errors.responsibleId}>
            <NativeSelect id="prazo-responsible" value={form.responsibleId} onChange={(e) => set("responsibleId", e.target.value)}>
              <option value="">Escolha o responsável</option>
              {getMembers().map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium">Origem</span>
            <ChoiceChips ariaLabel="Origem do prazo" options={ORIGIN_LABELS} value={form.origin} onChange={(v) => set("origin", v)} />
          </div>
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
                  ? `Na data interna, para ${responsible?.firstName ?? "o responsável"}, vinculada ao processo.`
                  : "Você não tem permissão para criar tarefas; o prazo ficará sem tarefa."}
              </span>
            </span>
          </label>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="prazo-form" disabled={saving}>
          Cadastrar prazo
        </Button>
      </ModalFooter>
    </>
  )
}

export function NewPrazoDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: Defaults }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo prazo"
      description="Data fatal, data interna e responsável. A tarefa vinculada é criada junto."
      icon={<Hourglass />}
      bare
    >
      <PrazoForm defaults={defaults} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}
