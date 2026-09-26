"use client"

import * as React from "react"
import { CircleDollarSign } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { CurrencyInput, Field, NativeSelect, TextInput } from "@/components/ui/field"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { getNow, toLocalISO } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import type { Invoice } from "@/types"

const SITUATIONS = ["A receber", "Já recebido"] as const
const METHODS: NonNullable<Invoice["method"]>[] = ["Pix", "Boleto", "Transferência", "Cartão"]

type Defaults = { clientId?: string; processId?: string }

/** Lançamento de honorários — grava uma fatura do módulo financeiro, sempre vinculada a um cliente. */
export function NewInvoiceDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: Defaults }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Novo lançamento"
      description="Honorários a receber ou um pagamento já recebido."
      icon={<CircleDollarSign />}
      bare
    >
      <InvoiceForm defaults={defaults} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

function InvoiceForm({ defaults, onClose }: { defaults?: Defaults; onClose: () => void }) {
  const data = useDemoData()
  const { addInvoice } = useDemoActions()
  const today = toLocalISO(getNow()).slice(0, 10)
  const [form, setForm] = React.useState(() => ({
    clientId: defaults?.clientId ?? (defaults?.processId ? (data.processes.find((p) => p.id === defaults.processId)?.clientId ?? "") : ""),
    processId: defaults?.processId ?? "",
    description: "",
    amount: 0,
    dueDate: today,
    situation: "A receber" as (typeof SITUATIONS)[number],
    paidAt: today,
    method: "" as Invoice["method"] | "",
  }))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  type FormState = typeof form
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: "" }))
  }

  const paid = form.situation === "Já recebido"
  const processes = data.processes.filter((p) => p.clientId === form.clientId)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.clientId) next.clientId = "Escolha o cliente."
    if (form.description.trim().length < 3) next.description = "Descreva o lançamento (ex.: Honorários iniciais — parcela 1/3)."
    if (form.amount <= 0) next.amount = "Informe um valor maior que zero."
    if (!form.dueDate) next.dueDate = "Informe o vencimento."
    if (paid && !form.paidAt) next.paidAt = "Informe a data do pagamento."
    if (paid && form.paidAt > today) next.paidAt = "O pagamento não pode ser no futuro."
    setErrors(next)
    if (Object.values(next).some(Boolean)) return

    const invoice = addInvoice({
      clientId: form.clientId,
      processId: form.processId || undefined,
      description: form.description.trim(),
      amount: form.amount,
      dueDate: form.dueDate,
      status: paid ? "pago" : "pendente",
      paidAt: paid ? form.paidAt : undefined,
      method: form.method || undefined,
    })
    onClose()
    toast.success(paid ? "Pagamento registrado." : "Lançamento criado.", {
      description: `${invoice.description} · ${formatCurrency(invoice.amount)}`,
    })
  }

  return (
    <>
      <ModalBody>
        <form id="invoice-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Cliente" htmlFor="inv-client" error={errors.clientId}>
            <NativeSelect
              id="inv-client"
              value={form.clientId}
              aria-invalid={!!errors.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value, processId: "" }))}
            >
              <option value="">Selecione…</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Processo" htmlFor="inv-process" optional>
            <NativeSelect id="inv-process" value={form.processId} disabled={!form.clientId} onChange={(e) => set("processId", e.target.value)}>
              <option value="">Nenhum</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.type}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Descrição" htmlFor="inv-description" error={errors.description} className="sm:col-span-2">
            <TextInput
              id="inv-description"
              autoFocus
              placeholder="Ex.: Honorários contratuais — parcela 1/3"
              value={form.description}
              aria-invalid={!!errors.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field label="Valor" htmlFor="inv-amount" error={errors.amount}>
            <CurrencyInput id="inv-amount" value={form.amount} aria-invalid={!!errors.amount} onChange={(v) => set("amount", v)} />
          </Field>
          <Field label="Vencimento" htmlFor="inv-due" error={errors.dueDate}>
            <TextInput
              id="inv-due"
              type="date"
              value={form.dueDate}
              aria-invalid={!!errors.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </Field>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[12.5px] font-medium">Situação</span>
            <ChoiceChips ariaLabel="Situação" options={SITUATIONS} value={form.situation} onChange={(v) => set("situation", v)} />
          </div>
          {paid && (
            <Field label="Pago em" htmlFor="inv-paid" error={errors.paidAt}>
              <TextInput
                id="inv-paid"
                type="date"
                value={form.paidAt}
                aria-invalid={!!errors.paidAt}
                onChange={(e) => set("paidAt", e.target.value)}
              />
            </Field>
          )}
          <Field label="Forma de pagamento" htmlFor="inv-method" optional className={paid ? undefined : "sm:col-span-2"}>
            <NativeSelect id="inv-method" value={form.method} onChange={(e) => set("method", e.target.value as Invoice["method"] | "")}>
              <option value="">Não informada</option>
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </NativeSelect>
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="invoice-form">
          {paid ? "Registrar pagamento" : "Criar lançamento"}
        </Button>
      </ModalFooter>
    </>
  )
}
