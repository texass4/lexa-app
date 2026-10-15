"use client"

import * as React from "react"
import { FolderInput, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { useRemovedWhileEditing } from "@/lib/store/on-demand"
import { byId } from "@/lib/store/indexes"
import { documentRequiredIssue } from "@/lib/clientes/clients"
import { ensureExtension } from "@/lib/core/format"
import { processTitle } from "@/lib/processos/label"
import type { DocumentKind, LegalDocument } from "@/types"
import { DOCUMENT_KINDS } from "./new-document-dialog"

/** Renomear: só o nome (a extensão do arquivo é mantida). Grava com a versão aberta. */
export function RenameDocumentDialog({ doc, onOpenChange }: { doc?: LegalDocument; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={!!doc} onOpenChange={onOpenChange} title="Renomear documento" description={doc?.name} icon={<Pencil />} size="sm" bare>
      {doc && <RenameForm doc={doc} onClose={() => onOpenChange(false)} />}
    </Modal>
  )
}

const baseName = (name: string, extension: string) => name.replace(new RegExp(`\\.${extension}$`, "i"), "")

function RenameForm({ doc, onClose }: { doc: LegalDocument; onClose: () => void }) {
  const { updateDocument, versionOf } = useOfficeActions()
  const [name, setName] = React.useState(() => baseName(doc.name, doc.extension))
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [baseVersion, setBaseVersion] = React.useState(() => versionOf("documents", doc.id))
  useRemovedWhileEditing("documents", doc.id)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) return setError("Dê um nome ao documento.")
    const next = ensureExtension(name, doc.extension)
    if (next === doc.name) return onClose()
    setSaving(true)
    const result = await updateDocument(doc.id, { name: next }, { baseVersion })
    setSaving(false)
    if (result.status === "conflict") {
      setName(baseName(result.current.name, doc.extension))
      setBaseVersion(versionOf("documents", doc.id))
      setError("Outra pessoa alterou este documento. O nome atual foi carregado; confira e salve de novo.")
      return
    }
    if (result.status !== "saved") return
    onClose()
    toast.success("Documento renomeado.", { description: next })
  }

  return (
    <>
      <ModalBody>
        <form id="rename-document" onSubmit={submit} noValidate>
          <Field label="Nome" htmlFor="doc-rename" error={error} hint={`A extensão .${doc.extension} é mantida.`}>
            <TextInput
              id="doc-rename"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={name}
              aria-invalid={!!error}
              onChange={(e) => {
                setName(e.target.value)
                setError("")
              }}
            />
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="rename-document" disabled={saving}>
          {saving ? "Salvando…" : "Renomear"}
        </Button>
      </ModalFooter>
    </>
  )
}

const KEEP = "__manter__"

/**
 * Mover: muda onde os documentos ficam na Central — categoria, cliente e processo
 * (a organização real de cada documento). O arquivo não muda de lugar no armazenamento.
 */
export function MoveDocumentsDialog({ docs, onOpenChange }: { docs?: LegalDocument[]; onOpenChange: (open: boolean) => void }) {
  const count = docs?.length ?? 0
  return (
    <Modal
      open={count > 0}
      onOpenChange={onOpenChange}
      title={count === 1 ? "Mover documento" : `Mover ${count} documentos`}
      description="Escolha a categoria, o cliente e o processo. Os documentos aparecem nesse lugar e no perfil do cliente e do processo."
      icon={<FolderInput />}
      bare
    >
      {docs && count > 0 && <MoveForm docs={docs} onClose={() => onOpenChange(false)} />}
    </Modal>
  )
}

function MoveForm({ docs, onClose }: { docs: LegalDocument[]; onClose: () => void }) {
  const data = useOfficeData()
  const { updateDocument, versionOf } = useOfficeActions()
  const single = docs.length === 1 ? docs[0] : undefined
  const same = <T,>(pick: (d: LegalDocument) => T) => (docs.every((d) => pick(d) === pick(docs[0])) ? pick(docs[0]) : undefined)
  // Vários documentos com valores diferentes começam em "manter como está".
  const [kind, setKind] = React.useState<string>(() => same((d) => d.kind) ?? KEEP)
  const [clientId, setClientId] = React.useState<string>(() => {
    const v = same((d) => d.clientId ?? "")
    return v === undefined ? KEEP : v
  })
  const [processId, setProcessId] = React.useState<string>(() => {
    const v = same((d) => d.processId ?? "")
    return v === undefined ? KEEP : v
  })
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  // Versões de quando o diálogo abriu: uma alteração de outra pessoa no meio-tempo é recusada.
  const [versions] = React.useState(() => new Map(docs.map((d) => [d.id, versionOf("documents", d.id)])))

  const processes = data.processes.filter((p) => clientId === KEEP || !clientId || p.clientId === clientId)

  const plan = docs.map((d) => {
    const nextKind = (kind === KEEP ? d.kind : kind) as DocumentKind
    const nextClient = clientId === KEEP ? d.clientId : clientId || undefined
    let nextProcess = processId === KEEP ? d.processId : processId || undefined
    // O processo precisa ser do cliente escolhido.
    const process = byId(data.processes, nextProcess)
    if (process && nextClient && process.clientId !== nextClient) nextProcess = undefined
    return { doc: d, patch: { kind: nextKind, clientId: nextClient, processId: nextProcess } }
  })
  const contractIssue = plan
    .filter((p) => p.patch.kind === "Contrato" && (p.patch.clientId !== p.doc.clientId || p.doc.kind !== "Contrato"))
    .map((p) => documentRequiredIssue(byId(data.clients, p.patch.clientId), "contrato"))
    .find(Boolean)

  const submit = async () => {
    if (saving || contractIssue) return
    setSaving(true)
    setError("")
    let moved = 0
    let refused = 0
    for (const { doc, patch } of plan) {
      const result = await updateDocument(doc.id, patch, { baseVersion: versions.get(doc.id) ?? null })
      if (result.status === "saved") moved++
      else refused++
    }
    setSaving(false)
    if (refused && !moved) {
      setError("Nenhum documento foi movido. Outra pessoa pode ter alterado ou excluído algum deles, ou a conexão falhou.")
      return
    }
    onClose()
    if (refused)
      toast.warning(`${moved} movido${moved === 1 ? "" : "s"}, ${refused} não.`, {
        description: "Os que não foram movidos mudaram ou saíram enquanto o diálogo estava aberto.",
      })
    else toast.success(moved === 1 ? "Documento movido." : `${moved} documentos movidos.`)
  }

  const keepOption = !single && <option value={KEEP}>Manter como está</option>

  return (
    <>
      <ModalBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Categoria" htmlFor="move-kind">
            <NativeSelect id="move-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {keepOption}
              {DOCUMENT_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Cliente" htmlFor="move-client" error={contractIssue} optional>
            <NativeSelect
              id="move-client"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value)
                if (e.target.value !== KEEP) setProcessId("")
              }}
            >
              {keepOption}
              <option value="">Nenhum</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Processo" htmlFor="move-process" optional className="sm:col-span-2">
            <NativeSelect
              id="move-process"
              value={processId}
              onChange={(e) => {
                const id = e.target.value
                setProcessId(id)
                const process = byId(data.processes, id)
                if (process?.clientId) setClientId(process.clientId)
              }}
            >
              {keepOption}
              <option value="">Nenhum</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {processTitle(p)} — {p.code}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving || !!contractIssue}>
          {saving ? "Movendo…" : "Mover"}
        </Button>
      </ModalFooter>
    </>
  )
}
