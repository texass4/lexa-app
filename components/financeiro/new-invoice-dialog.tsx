"use client"

import * as React from "react"
import { CircleDollarSign, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { CurrencyInput, Field, NativeSelect, TextInput } from "@/components/ui/field"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { getNow, toLocalISO } from "@/lib/core/dates"
import { formatCurrency } from "@/lib/core/format"
import { documentRequiredIssue } from "@/lib/clientes/clients"
import type { Invoice, Process } from "@/types"

const SITUATIONS = ["A receber", "Já recebido"] as const
const METHODS: NonNullable<Invoice["method"]>[] = ["Pix", "Boleto", "Transferência", "Cartão"]

type Defaults = { clientId?: string; processId?: string }

/**
 * Lançamento de honorários — grava uma fatura do módulo financeiro, sempre vinculada a
 * um cliente. Com `invoice`, o mesmo formulário edita (inclusive a baixa).
 */
export function NewInvoiceDialog({
  open,
  onOpenChange,
  defaults,
  invoice,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaults?: Defaults
  invoice?: Invoice
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={invoice ? "Editar lançamento" : "Novo lançamento"}
      description={invoice ? "Altere valores, datas ou a situação do lançamento." : "Honorários a receber ou um pagamento já recebido."}
      icon={invoice ? <Pencil /> : <CircleDollarSign />}
      bare
    >
      <InvoiceForm invoice={invoice} defaults={defaults} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

function initialState(invoice: Invoice | undefined, defaults: Defaults | undefined, processes: Process[], today: string) {
  if (invoice) {
    return {
      clientId: invoice.clientId,
      processId: invoice.processId ?? "",
      description: invoice.description,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      situation: (invoice.status === "pago" ? "Já recebido" : "A receber") as (typeof SITUATIONS)[number],
      paidAt: invoice.paidAt ?? today,
      method: (invoice.method ?? "") as Invoice["method"] | "",
    }
  }
  return {
    clientId: defaults?.clientId ?? (defaults?.processId ? (processes.find((p) => p.id === defaults.processId)?.clientId ?? "") : ""),
    processId: defaults?.processId ?? "",
    description: "",
    amount: 0,
    dueDate: today,
    situation: "A receber" as (typeof SITUATIONS)[number],
    paidAt: today,
    method: "" as Invoice["method"] | "",
  }
}

function InvoiceForm({ invoice, defaults, onClose }: { invoice?: Invoice; defaults?: Defaults; onClose: () => void }) {
  const data = useOfficeData()
  const { addInvoice, updateInvoice, versionOf } = useOfficeActions()
  const today = toLocalISO(getNow()).slice(0, 10)
  const [form, setForm] = React.useState(() => initialState(invoice, defaults, data.processes, today))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  // Versão do lançamento quando o formulário abriu: se outra pessoa salvar antes, esta edição é recusada.
  const [baseVersion, setBaseVersion] = React.useState(() => (invoice ? versionOf("invoices", invoice.id) : null))
  const [saving, setSaving] = React.useState(false)
  type FormState = typeof form
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: "" }))
  }

  const paid = form.situation === "Já recebido"
  const processes = data.processes.filter((p) => p.clientId === form.clientId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const next: Record<string, string> = {}
    if (!form.clientId) next.clientId = "Escolha o cliente."
    // Honorários exigem CPF/CNPJ do cliente (vínculo novo ou trocado; o banco também confere).
    else if (!invoice || invoice.clientId !== form.clientId) {
      const issue = documentRequiredIssue(
        data.clients.find((c) => c.id === form.clientId),
        "fatura",
      )
      if (issue) next.clientId = issue
    }
    if (form.description.trim().length < 3) next.description = "Descreva o lançamento (ex.: Honorários iniciais — parcela 1/3)."
    if (form.amount <= 0) next.amount = "Informe um valor maior que zero."
    if (!form.dueDate) next.dueDate = "Informe o vencimento."
    if (paid && !form.paidAt) next.paidAt = "Informe a data do pagamento."
    if (paid && form.paidAt > today) next.paidAt = "O pagamento não pode ser no futuro."
    setErrors(next)
    if (Object.values(next).some(Boolean)) return

    const payload = {
      clientId: form.clientId,
      processId: form.processId || undefined,
      description: form.description.trim(),
      amount: form.amount,
      dueDate: form.dueDate,
      status: (paid ? "pago" : "pendente") as Invoice["status"],
      paidAt: paid ? form.paidAt : undefined,
      method: form.method || undefined,
    }

    if (invoice) {
      setSaving(true)
      const result = await updateInvoice(invoice.id, payload, { baseVersion })
      setSaving(false)
      if (result.status === "conflict") {
        // O aviso já apareceu; o formulário mostra o lançamento como está agora para revisar.
        setForm(initialState(result.current, defaults, data.processes, today))
        setBaseVersion(versionOf("invoices", invoice.id))
        return
      }
      if (result.status === "error") return
      onClose()
      if (result.status === "saved")
        toast.success("Alterações salvas.", { description: `${payload.description} · ${formatCurrency(payload.amount)}` })
      return
    }

    const created = addInvoice(payload)
    onClose()
    toast.success(paid ? "Pagamento registrado." : "Lançamento criado.", {
      description: `${created.description} · ${formatCurrency(created.amount)}`,
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
        <Button type="submit" form="invoice-form" disabled={saving}>
          {invoice ? "Salvar alterações" : paid ? "Registrar pagamento" : "Criar lançamento"}
        </Button>
      </ModalFooter>
    </>
  )
}
