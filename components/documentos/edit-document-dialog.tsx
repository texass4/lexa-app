"use client"

import * as React from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { documentRequiredIssue } from "@/lib/clientes/clients"
import { ensureExtension } from "@/lib/core/format"
import type { DocumentKind, LegalDocument } from "@/types"
import { DOCUMENT_KINDS } from "./new-document-dialog"

/** Edição dos dados do documento: nome, tipo, cliente e processo. O arquivo não muda. */
export function EditDocumentDialog({ doc, onOpenChange }: { doc?: LegalDocument; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={!!doc} onOpenChange={onOpenChange} title="Editar documento" description={doc?.name} icon={<Pencil />} bare>
      {doc && <EditDocumentForm doc={doc} onClose={() => onOpenChange(false)} />}
    </Modal>
  )
}

const initialState = (doc: LegalDocument) => ({ name: doc.name, kind: doc.kind, clientId: doc.clientId ?? "", processId: doc.processId ?? "" })

function EditDocumentForm({ doc, onClose }: { doc: LegalDocument; onClose: () => void }) {
  const data = useOfficeData()
  const { updateDocument, versionOf } = useOfficeActions()
  const [form, setForm] = React.useState(() => initialState(doc))
  const [errors, setErrors] = React.useState<{ name?: string; clientId?: string }>({})
  // Versão quando o formulário abriu: se alguém alterou o documento antes, a edição é recusada.
  const [baseVersion, setBaseVersion] = React.useState(() => versionOf("documents", doc.id))
  const [saving, setSaving] = React.useState(false)

  // Processo sempre do cliente escolhido; escolher o processo traz o cliente dele.
  const processes = data.processes.filter((p) => !form.clientId || p.clientId === form.clientId)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const next: typeof errors = {}
    if (form.name.trim().replace(/\.[a-z0-9]+$/i, "").length < 1) next.name = "Dê um nome ao documento."
    // Contrato exige CPF/CNPJ do cliente (vínculo novo ou alterado; o banco também confere).
    const linkChanged = form.clientId !== (doc.clientId ?? "") || form.kind !== doc.kind
    if (form.kind === "Contrato" && linkChanged) {
      const issue = documentRequiredIssue(byId(data.clients, form.clientId), "contrato")
      if (issue) next.clientId = issue
    }
    setErrors(next)
    if (Object.keys(next).length) return

    const patch = {
      name: ensureExtension(form.name, doc.extension),
      kind: form.kind,
      clientId: form.clientId || undefined,
      processId: form.processId || undefined,
    }
    setSaving(true)
    const result = await updateDocument(doc.id, patch, { baseVersion })
    setSaving(false)
    if (result.status === "conflict") {
      setForm(initialState(result.current))
      setBaseVersion(versionOf("documents", doc.id))
      return
    }
    if (result.status === "error") return
    onClose()
    if (result.status === "saved") toast.success("Documento atualizado.", { description: patch.name })
  }

  return (
    <>
      <ModalBody>
        <form id="edit-document" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Nome" htmlFor="doc-edit-name" error={errors.name} hint={`A extensão .${doc.extension} é mantida.`} className="sm:col-span-2">
            <TextInput
              id="doc-edit-name"
              autoFocus
              value={form.name}
              aria-invalid={!!errors.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
                setErrors((x) => ({ ...x, name: undefined }))
              }}
            />
          </Field>
          <Field label="Tipo" htmlFor="doc-edit-kind">
            <NativeSelect
              id="doc-edit-kind"
              value={form.kind}
              onChange={(e) => {
                setForm((f) => ({ ...f, kind: e.target.value as DocumentKind }))
                setErrors((x) => ({ ...x, clientId: undefined }))
              }}
            >
              {DOCUMENT_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Cliente" htmlFor="doc-edit-client" error={errors.clientId} optional>
            <NativeSelect
              id="doc-edit-client"
              value={form.clientId}
              aria-invalid={!!errors.clientId}
              onChange={(e) => {
                const clientId = e.target.value
                setErrors((x) => ({ ...x, clientId: undefined }))
                setForm((f) => {
                  const process = byId(data.processes, f.processId)
                  // O processo de outro cliente deixa de valer.
                  return { ...f, clientId, processId: process && clientId && process.clientId !== clientId ? "" : f.processId }
                })
              }}
            >
              <option value="">Nenhum</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Processo" htmlFor="doc-edit-process" optional className="sm:col-span-2">
            <NativeSelect
              id="doc-edit-process"
              value={form.processId}
              onChange={(e) => {
                const processId = e.target.value
                const process = byId(data.processes, processId)
                setForm((f) => ({ ...f, processId, clientId: process?.clientId || f.clientId }))
              }}
            >
              <option value="">Nenhum</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.type}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="edit-document" disabled={saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </ModalFooter>
    </>
  )
}
