"use client"

import * as React from "react"
import { CloudUpload, FilePlus, TriangleAlert, X } from "lucide-react"
import { cn } from "cn"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect } from "@/components/ui/field"
import { FileIcon } from "@/components/shared/file-icon"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { formatFileSize } from "@/lib/core/format"
import { documentRequiredIssue } from "@/lib/clientes/clients"
import { ACCEPT_ATTRIBUTE, extensionOf, uploadIssue } from "@/lib/documentos/library"
import { enqueueUploads } from "@/lib/documentos/upload-queue"
import { processTitle } from "@/lib/processos/label"
import type { DocumentKind } from "@/types"

export const DOCUMENT_KINDS: DocumentKind[] = ["Contrato", "Procuração", "Documento pessoal", "Petição", "Comprovante", "Laudo", "Decisão"]

type Defaults = { clientId?: string; processId?: string; files?: File[]; documentKind?: DocumentKind }

/**
 * Envio de documentos: um ou vários arquivos, com o destino (categoria, cliente e
 * processo). Os arquivos entram na fila de envios, que mostra o progresso real de cada um
 * e só dá o documento como salvo depois que o armazenamento e o banco confirmam.
 */
export function NewDocumentDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: Defaults }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Enviar documentos"
      description="Escolha os arquivos e onde eles ficam: categoria, cliente e processo."
      icon={<FilePlus />}
      size="lg"
      bare
    >
      <UploadForm defaults={defaults} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

interface Picked {
  key: string
  file: File
  issue: string | null
}

const keyOf = (f: File) => `${f.name}:${f.size}:${f.lastModified}`
const toPicked = (files: File[]): Picked[] => files.map((file) => ({ key: keyOf(file), file, issue: uploadIssue(file) }))

function UploadForm({ defaults, onClose }: { defaults?: Defaults; onClose: () => void }) {
  const data = useOfficeData()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [picked, setPicked] = React.useState<Picked[]>(() => toPicked(defaults?.files ?? []))
  const [dragging, setDragging] = React.useState(false)
  const [kind, setKind] = React.useState<DocumentKind | "">(defaults?.documentKind ?? "")
  const [clientId, setClientId] = React.useState(defaults?.clientId ?? "")
  const [processId, setProcessId] = React.useState(defaults?.processId ?? "")
  const [errors, setErrors] = React.useState<{ files?: string; kind?: string }>({})

  const add = (files: FileList | File[] | null | undefined) => {
    if (!files?.length) return
    setPicked((list) => {
      const known = new Set(list.map((p) => p.key))
      return [...list, ...toPicked(Array.from(files)).filter((p) => !known.has(p.key))]
    })
    setErrors((e) => ({ ...e, files: undefined }))
  }
  const valid = picked.filter((p) => !p.issue)
  const invalid = picked.length - valid.length
  const processes = data.processes.filter((p) => !clientId || p.clientId === clientId)
  const contractIssue = kind === "Contrato" ? documentRequiredIssue(byId(data.clients, clientId), "contrato") : undefined
  const total = valid.reduce((n, p) => n + p.file.size, 0)

  const submit = () => {
    const next: typeof errors = {}
    if (!valid.length) next.files = picked.length ? "Nenhum dos arquivos pode ser enviado." : "Escolha ou arraste ao menos um arquivo."
    if (!kind) next.kind = "Escolha a categoria."
    setErrors(next)
    // Contrato exige CPF/CNPJ do cliente (o banco também confere, `0010_contacts.sql`).
    if (Object.keys(next).length || contractIssue || !kind) return
    // A bandeja de envios (canto da tela) mostra o progresso de cada arquivo.
    enqueueUploads(
      valid.map((p) => p.file),
      { kind, clientId: clientId || undefined, processId: processId || undefined },
    )
    onClose()
  }

  return (
    <>
      <ModalBody>
        <div className="space-y-5">
          <div
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return
              e.preventDefault()
              setDragging(false)
              add(e.dataTransfer.files)
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-[12px] border border-dashed px-6 py-6 text-center transition-colors duration-150",
              dragging
                ? "border-brand bg-brand-soft/60"
                : errors.files
                  ? "border-danger/50 bg-danger-soft/30"
                  : "border-border-strong bg-surface-muted/40",
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground">
              <CloudUpload className="size-5" />
            </span>
            <p className="mt-3 text-[13.5px] font-medium">Arraste os arquivos aqui</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">PDF, Word, Excel (XLSX, XLS, CSV), TXT, JPG ou PNG — até 25 MB cada</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => inputRef.current?.click()}>
              Escolher arquivos
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                add(e.target.files)
                e.target.value = ""
              }}
            />
            {errors.files && (
              <p role="alert" className="mt-3 text-[12px] text-danger">
                {errors.files}
              </p>
            )}
          </div>

          {picked.length > 0 && (
            <div>
              <p className="mb-2 text-[12.5px] text-muted-foreground">
                {valid.length} arquivo{valid.length === 1 ? "" : "s"} para enviar · {formatFileSize(total)}
                {invalid > 0 && (
                  <span className="text-danger">
                    {" "}
                    · {invalid} não pode{invalid === 1 ? "" : "m"} ser enviado{invalid === 1 ? "" : "s"}
                  </span>
                )}
              </p>
              <ul
                className="max-h-[220px] divide-y divide-border/70 overflow-y-auto rounded-[10px] border border-border thin-scrollbar"
                aria-label="Arquivos escolhidos"
              >
                {picked.map((p) => (
                  <li key={p.key} className={cn("flex items-center gap-3 px-3 py-2", p.issue && "bg-danger-soft/25")}>
                    <FileIcon extension={extensionOf(p.file.name) ?? "?"} className="h-8 w-6 text-[7px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{p.file.name}</p>
                      <p className={cn("text-[11.5px]", p.issue ? "flex items-center gap-1 text-danger" : "text-muted-foreground")}>
                        {p.issue ? (
                          <>
                            <TriangleAlert className="size-3" aria-hidden /> {p.issue}
                          </>
                        ) : (
                          formatFileSize(p.file.size)
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Tirar ${p.file.name} da lista`}
                      onClick={() => setPicked((list) => list.filter((x) => x.key !== p.key))}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Categoria" htmlFor="doc-kind" error={errors.kind}>
              <NativeSelect id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                <option value="" disabled>
                  Escolha a categoria
                </option>
                {DOCUMENT_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Cliente" htmlFor="doc-client" error={contractIssue} optional>
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
              <NativeSelect
                id="doc-process"
                value={processId}
                onChange={(e) => {
                  const id = e.target.value
                  setProcessId(id)
                  // Escolher o processo traz o cliente dele.
                  const process = byId(data.processes, id)
                  if (process?.clientId) setClientId(process.clientId)
                }}
              >
                <option value="">Nenhum</option>
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {processTitle(p)} — {p.code}
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
        <Button onClick={submit} disabled={!picked.length}>
          <CloudUpload /> {valid.length > 1 ? `Enviar ${valid.length} arquivos` : "Enviar"}
        </Button>
      </ModalFooter>
    </>
  )
}
