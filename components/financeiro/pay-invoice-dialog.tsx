"use client"

import * as React from "react"
import { CircleCheck } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { useOfficeActions } from "@/lib/store/office-store"
import { fmtNumericDate, getNow, toLocalISO } from "@/lib/core/dates"
import { formatCurrency } from "@/lib/core/format"
import type { Invoice } from "@/types"

const METHODS: NonNullable<Invoice["method"]>[] = ["Pix", "Boleto", "Transferência", "Cartão"]

/** Baixa de um lançamento direto da lista: data do pagamento e forma. */
export function PayInvoiceDialog({ invoice, onOpenChange }: { invoice?: Invoice; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal
      open={!!invoice}
      onOpenChange={onOpenChange}
      title="Dar baixa"
      description={invoice ? `${invoice.description} · ${formatCurrency(invoice.amount)}` : undefined}
      icon={<CircleCheck />}
      size="sm"
      bare
    >
      {invoice && <PayForm invoice={invoice} onClose={() => onOpenChange(false)} />}
    </Modal>
  )
}

function PayForm({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { updateInvoice, versionOf } = useOfficeActions()
  const today = toLocalISO(getNow()).slice(0, 10)
  const [paidAt, setPaidAt] = React.useState(today)
  const [method, setMethod] = React.useState<Invoice["method"] | "">(invoice.method ?? "")
  const [error, setError] = React.useState("")
  // Versão quando a baixa abriu: se alguém alterou o lançamento antes, a baixa é recusada.
  const [baseVersion] = React.useState(() => versionOf("invoices", invoice.id))
  const [saving, setSaving] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (!paidAt) return setError("Informe a data do pagamento.")
    if (paidAt > today) return setError("O pagamento não pode ser no futuro.")
    setSaving(true)
    const result = await updateInvoice(invoice.id, { status: "pago", paidAt, method: method || undefined }, { baseVersion })
    setSaving(false)
    // Conflito ou erro: o aviso já apareceu; fecha para a pessoa ver o lançamento atualizado.
    onClose()
    if (result.status === "saved") {
      toast.success("Pagamento registrado.", {
        description: `${invoice.description} · ${formatCurrency(invoice.amount)} · ${fmtNumericDate(paidAt)}`,
      })
    }
  }

  return (
    <>
      <ModalBody>
        <form id="pay-invoice" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Pago em" htmlFor="pay-date" error={error}>
            <TextInput
              id="pay-date"
              type="date"
              autoFocus
              value={paidAt}
              max={today}
              aria-invalid={!!error}
              onChange={(e) => {
                setPaidAt(e.target.value)
                setError("")
              }}
            />
          </Field>
          <Field label="Forma de pagamento" htmlFor="pay-method" optional>
            <NativeSelect id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as Invoice["method"] | "")}>
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
        <Button type="submit" form="pay-invoice" disabled={saving}>
          {saving ? "Registrando…" : "Registrar pagamento"}
        </Button>
      </ModalFooter>
    </>
  )
}
