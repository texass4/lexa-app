"use client"

import * as React from "react"
import { CloudUpload, FilePlus, FileText, X } from "lucide-react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { cn } from "cn"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect } from "@/components/ui/field"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { formatFileSize, uid } from "@/lib/format"
import { currentOrgId } from "@/lib/account"
import { getSupabase } from "@/lib/supabase/client"
import type { DocumentKind } from "@/types"

const KINDS: DocumentKind[] = ["Contrato", "Procuração", "Documento pessoal", "Petição", "Comprovante", "Laudo", "Decisão"]
const EXTENSIONS = ["pdf", "docx", "doc", "txt", "jpg", "png"] as const
const MAX_BYTES = 25 * 1024 * 1024
/** O tipo vem da extensão aceita, nunca do navegador: um .pdf é servido sempre como PDF. */
const MIME: Record<(typeof EXTENSIONS)[number], string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain; charset=utf-8",
  jpg: "image/jpeg",
  png: "image/png",
}

type Defaults = { clientId?: string; processId?: string }

export function NewDocumentDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: Defaults }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar documento"
      description="Anexe arquivos ao cliente ou processo."
      icon={<FilePlus />}
      bare
    >
      <DocumentForm defaults={defaults} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

function DocumentForm({ defaults, onClose }: { defaults?: Defaults; onClose: () => void }) {
  const data = useDemoData()
  const { addDocument } = useDemoActions()
  const inputRef = React.useRef<HTMLInputElement>(null)
  /** `source` ausente = arquivo de exemplo, só com os metadados. */
  const [file, setFile] = React.useState<{ name: string; size: number; source?: File } | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [kind, setKind] = React.useState<DocumentKind>("Comprovante")
  const [clientId, setClientId] = React.useState(defaults?.clientId ?? "")
  const [processId, setProcessId] = React.useState(defaults?.processId ?? "")
  const [error, setError] = React.useState("")
  const [uploading, setUploading] = React.useState(false)

  const pick = (f?: File | null) => {
    if (!f) return
    if (f.size > MAX_BYTES) {
      setError("O arquivo passa de 25 MB.")
      return
    }
    setFile({ name: f.name, size: f.size, source: f })
    setError("")
  }

  const pickSample = () => {
    const client = data.clients.find((c) => c.id === clientId)
    setFile({
      name: `Comprovante de rendimentos${client ? ` — ${client.name}` : ""}.pdf`,
      size: 684_000,
    })
    setError("")
  }

  const submit = async () => {
    if (!file) {
      setError("Selecione ou arraste um arquivo.")
      return
    }
    setUploading(true)
    const ext = (file.name.split(".").pop()?.toLowerCase() ?? "pdf") as (typeof EXTENSIONS)[number]
    const extension = EXTENSIONS.includes(ext) ? ext : "pdf"

    let storagePath: string | undefined
    if (file.source) {
      // Pasta do escritório: a política do Storage só aceita a de quem está logado.
      storagePath = `${currentOrgId()}/${uid("file")}.${extension}`
      const { error: uploadError } = await getSupabase().storage.from("documents").upload(storagePath, file.source, { contentType: MIME[extension] })
      if (uploadError) {
        setUploading(false)
        setError("Não foi possível enviar o arquivo. Verifique se você pode adicionar documentos e tente de novo.")
        return
      }
    }

    addDocument({
      name: file.name,
      kind,
      clientId: clientId || undefined,
      processId: processId || undefined,
      extension,
      sizeBytes: file.size,
      storagePath,
    })
    onClose()
    toast.success("Documento adicionado.", { description: file.name })
  }

  const processes = data.processes.filter((p) => !clientId || p.clientId === clientId)

  return (
    <>
      <ModalBody>
        <div className="space-y-4">
          {file ? (
            <div className="relative overflow-hidden rounded-[12px] border border-border bg-surface p-3.5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-[10px] bg-danger-soft text-danger">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{file.name}</p>
                  <p className="text-[12px] text-muted-foreground">{formatFileSize(file.size)} · pronto para envio</p>
                </div>
                {!uploading && (
                  <Button variant="ghost" size="icon-sm" aria-label="Remover arquivo" onClick={() => setFile(null)}>
                    <X />
                  </Button>
                )}
              </div>
              {uploading && (
                <motion.div
                  className="absolute bottom-0 left-0 h-[2px] bg-gold"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.7, ease: "easeInOut" }}
                />
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                pick(e.dataTransfer.files?.[0])
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-[12px] border border-dashed px-6 py-8 text-center transition-colors",
                dragging ? "border-gold bg-gold-soft/60" : error ? "border-danger/50 bg-danger-soft/40" : "border-border-strong bg-surface-muted/40",
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground">
                <CloudUpload className="size-5" />
              </span>
              <p className="mt-3 text-[13.5px] font-medium">Arraste o arquivo aqui</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">PDF, DOCX, TXT ou imagem — até 25 MB</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                  Escolher arquivo
                </Button>
                <Button variant="ghost" size="sm" onClick={pickSample}>
                  Usar arquivo de exemplo
                </Button>
              </div>
              <input ref={inputRef} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
              {error && (
                <p role="alert" className="mt-3 text-[12px] text-danger">
                  {error}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="doc-kind">
              <NativeSelect id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Cliente" htmlFor="doc-client" optional>
              <NativeSelect
                id="doc-client"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value)
                  setProcessId("")
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
            <Field label="Processo" htmlFor="doc-process" optional className="sm:col-span-2">
              <NativeSelect id="doc-process" value={processId} onChange={(e) => setProcessId(e.target.value)}>
                <option value="">Nenhum</option>
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.type}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={uploading}>
          {uploading ? "Enviando…" : "Adicionar documento"}
        </Button>
      </ModalFooter>
    </>
  )
}
