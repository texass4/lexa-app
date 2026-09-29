"use client"

import * as React from "react"
import { CircleAlert, CircleCheck, CloudUpload, Copy, Download, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/field"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { currentUserId, getMembers } from "@/lib/account"
import { decodeCSV, parseCSV } from "@/lib/csv"
import { downloadFile, toCsv } from "@/lib/export"
import { getNow, toLocalISO } from "@/lib/dates"
import { CLIENT_STATUS } from "@/lib/config"
import {
  IMPORT_FIELDS,
  buildImportRows,
  detectColumns,
  summarizeImport,
  type ColumnMapping,
  type ImportField,
  type ImportRow,
} from "@/lib/client-import"

/** Limite por arquivo: acima disso, dividir a planilha (a gravação é em lotes de 100). */
const MAX_ROWS = 2000
const MAX_BYTES = 5 * 1024 * 1024

type Parsed = { fileName: string; header: string[]; records: string[][] }

interface Report {
  imported: number
  duplicates: ImportRow[]
  invalid: ImportRow[]
  failed: { row: ImportRow; reason: string }[]
}

type Step =
  | { kind: "file" }
  | { kind: "map"; parsed: Parsed }
  | { kind: "review"; parsed: Parsed; rows: ImportRow[] }
  | { kind: "report"; report: Report }

export function ImportClientsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Importar clientes"
      description="Planilha CSV: confira as colunas, revise e confirme. Nada é gravado antes da confirmação."
      icon={<FileSpreadsheet />}
      size="lg"
      bare
    >
      <ImportFlow onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

const STEPS = ["Arquivo", "Colunas", "Revisão", "Relatório"] as const

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-5 flex items-center gap-2 text-[12px]" aria-label="Etapas da importação">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
              i < current ? "bg-success text-white" : i === current ? "bg-foreground text-background" : "bg-surface-muted text-subtle",
            )}
          >
            {i + 1}
          </span>
          <span className={cn(i === current ? "font-medium text-foreground" : "text-muted-foreground", "max-sm:hidden")}>{label}</span>
          {i < STEPS.length - 1 && <span className="h-px w-4 bg-border sm:w-6" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

function ImportFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = React.useState<Step>({ kind: "file" })
  return (
    <>
      {step.kind === "file" && <FileStep onClose={onClose} onParsed={(parsed) => setStep({ kind: "map", parsed })} />}
      {step.kind === "map" && (
        <MapStep
          parsed={step.parsed}
          onBack={() => setStep({ kind: "file" })}
          onReady={(rows) => setStep({ kind: "review", parsed: step.parsed, rows })}
        />
      )}
      {step.kind === "review" && (
        <ReviewStep
          rows={step.rows}
          onBack={() => setStep({ kind: "map", parsed: step.parsed })}
          onDone={(report) => setStep({ kind: "report", report })}
        />
      )}
      {step.kind === "report" && <ReportStep report={step.report} onClose={onClose} />}
    </>
  )
}

/* --------------------------------- 1. arquivo -------------------------------- */

function FileStep({ onClose, onParsed }: { onClose: () => void; onParsed: (parsed: Parsed) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState("")

  const read = async (file?: File | null) => {
    if (!file) return
    setError("")
    if (!/\.(csv|txt)$/i.test(file.name)) return setError("Envie um arquivo .csv (no Excel: Salvar como › CSV).")
    if (file.size > MAX_BYTES) return setError("O arquivo passa de 5 MB. Divida a planilha em partes.")
    const rows = parseCSV(decodeCSV(await file.arrayBuffer()))
    const [header, ...records] = rows
    if (!header || !records.length) return setError("Não encontramos linhas nesta planilha. A primeira linha deve ter os nomes das colunas.")
    if (records.length > MAX_ROWS)
      return setError(`A planilha tem ${records.length} linhas; o limite é ${MAX_ROWS} por importação. Divida o arquivo.`)
    onParsed({ fileName: file.name, header, records })
  }

  const template = () => {
    downloadFile(
      "modelo-importacao-clientes.csv",
      toCsv(
        [
          "Nome",
          "CPF/CNPJ",
          "Tipo",
          "E-mail",
          "Telefone",
          "WhatsApp",
          "Nascimento",
          "Endereço",
          "CEP",
          "Cidade",
          "UF",
          "Área",
          "Responsável",
          "Tags",
          "Observações",
        ],
        [
          [
            "Maria da Silva",
            "529.982.247-25",
            "PF",
            "maria@exemplo.com",
            "(48) 99999-0000",
            "",
            "15/03/1980",
            "Rua das Flores, 120",
            "88000-000",
            "Florianópolis",
            "SC",
            "Cível",
            "",
            "Indicação",
            "",
          ],
        ],
      ),
      "text/csv;charset=utf-8",
    )
  }

  return (
    <>
      <ModalBody>
        <Stepper current={0} />
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void read(e.dataTransfer.files?.[0])
          }}
          className={cn(
            "flex flex-col items-center justify-center rounded-[12px] border border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-brand bg-brand-soft/60" : error ? "border-danger/50 bg-danger-soft/40" : "border-border-strong bg-surface-muted/40",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground">
            <CloudUpload className="size-5" />
          </span>
          <p className="mt-3 text-[13.5px] font-medium">Arraste a planilha aqui</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">CSV separado por ponto e vírgula ou vírgula — até {MAX_ROWS} linhas</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              Escolher arquivo
            </Button>
            <Button variant="ghost" size="sm" onClick={template}>
              <Download /> Baixar modelo
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void read(e.target.files?.[0])}
          />
          {error && (
            <p role="alert" className="mt-3 text-[12px] text-danger">
              {error}
            </p>
          )}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          Obrigatório só o nome. Sem CPF/CNPJ, a pessoa entra como Contato. Quem já está cadastrado (mesmo CPF/CNPJ, ou mesmo e-mail/telefone quando
          falta documento) não é importado de novo.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </ModalFooter>
    </>
  )
}

/* --------------------------------- 2. colunas -------------------------------- */

function MapStep({ parsed, onBack, onReady }: { parsed: Parsed; onBack: () => void; onReady: (rows: ImportRow[]) => void }) {
  const data = useDemoData()
  const [mapping, setMapping] = React.useState<ColumnMapping>(() => detectColumns(parsed.header))
  const [error, setError] = React.useState("")
  const preview = parsed.records.slice(0, 4)

  const setField = (field: ImportField, value: string) => {
    setError("")
    setMapping((m) => {
      const next = { ...m }
      // Uma coluna alimenta um campo só.
      for (const key of Object.keys(next) as ImportField[]) if (next[key] === Number(value)) delete next[key]
      if (value === "") delete next[field]
      else next[field] = Number(value)
      return next
    })
  }

  const validate = () => {
    if (mapping.name === undefined) return setError("Indique a coluna do nome.")
    const rows = buildImportRows(parsed.records, mapping, {
      existing: data.clients,
      members: getMembers(),
      defaultOwnerId: currentUserId(),
      defaultArea: "Cível",
      today: toLocalISO(getNow()).slice(0, 10),
    })
    onReady(rows)
  }

  return (
    <>
      <ModalBody>
        <Stepper current={1} />
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{parsed.fileName}</span> · {parsed.records.length}{" "}
          {parsed.records.length === 1 ? "linha" : "linhas"}. Confira de qual coluna vem cada informação.
        </p>

        <div className="mt-4 overflow-x-auto rounded-[10px] border border-border thin-scrollbar">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                {parsed.header.map((h, i) => (
                  <th key={i} className="border-b border-border bg-surface-muted/50 px-3 py-2 text-left font-medium whitespace-nowrap">
                    {h || `Coluna ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((record, r) => (
                <tr key={r}>
                  {parsed.header.map((_, i) => (
                    <td key={i} className="max-w-[180px] truncate border-b border-border/70 px-3 py-1.5 text-muted-foreground">
                      {record[i] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
          {IMPORT_FIELDS.map(({ field, label, required }) => (
            <label key={field} className="flex items-center justify-between gap-3">
              <span className="text-[12.5px]">
                {label}
                {required && <span className="text-danger"> *</span>}
              </span>
              <NativeSelect
                aria-label={`Coluna de ${label}`}
                value={mapping[field] === undefined ? "" : String(mapping[field])}
                onChange={(e) => setField(field, e.target.value)}
                className="h-8 w-[170px] text-[12.5px]"
              >
                <option value="">— não importar —</option>
                {parsed.header.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Coluna ${i + 1}`}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[12px] text-danger">
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={validate}>Validar dados</Button>
      </ModalFooter>
    </>
  )
}

/* --------------------------------- 3. revisão -------------------------------- */

const ROW_TONE = { ok: "success", duplicate: "warning", invalid: "danger" } as const
const ROW_LABEL = { ok: "Será importado", duplicate: "Duplicado", invalid: "Inválido" } as const

function RowList({ rows }: { rows: ImportRow[] }) {
  if (!rows.length) return <p className="py-6 text-center text-[12.5px] text-muted-foreground">Nenhuma linha nesta situação.</p>
  return (
    <ul className="divide-y divide-border rounded-[10px] border border-border">
      {rows.slice(0, 300).map((row) => (
        <li key={row.line} className="flex items-start gap-3 px-3 py-2">
          <span className="tabular w-12 shrink-0 pt-0.5 text-[11.5px] text-subtle">linha {row.line}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">
              {row.draft.name || <span className="text-subtle">(sem nome)</span>}
              {row.draft.document && <span className="ml-2 font-normal text-muted-foreground">{row.draft.document}</span>}
            </p>
            {[...row.reasons, ...row.warnings].map((text) => (
              <p key={text} className={cn("text-[12px]", row.reasons.includes(text) ? "text-danger" : "text-muted-foreground")}>
                {text}
              </p>
            ))}
          </div>
          {row.status === "ok" ? (
            <StatusBadge tone={CLIENT_STATUS[row.draft.status].tone} size="sm">
              {CLIENT_STATUS[row.draft.status].label}
            </StatusBadge>
          ) : (
            <StatusBadge tone={ROW_TONE[row.status]} size="sm">
              {ROW_LABEL[row.status]}
            </StatusBadge>
          )}
        </li>
      ))}
      {rows.length > 300 && <li className="px-3 py-2 text-[12px] text-muted-foreground">e mais {rows.length - 300} linhas…</li>}
    </ul>
  )
}

function ReviewStep({ rows, onBack, onDone }: { rows: ImportRow[]; onBack: () => void; onDone: (report: Report) => void }) {
  const { importClients } = useDemoActions()
  const summary = summarizeImport(rows)
  const [tab, setTab] = React.useState<"ok" | "duplicate" | "invalid">(summary.ok ? "ok" : summary.invalid ? "invalid" : "duplicate")
  const [importing, setImporting] = React.useState(false)
  const ready = rows.filter((r) => r.status === "ok")

  const confirm = async () => {
    if (importing || !ready.length) return
    setImporting(true)
    const { saved, failed } = await importClients(ready.map((r) => r.draft))
    setImporting(false)
    onDone({
      imported: saved.length,
      duplicates: rows.filter((r) => r.status === "duplicate"),
      invalid: rows.filter((r) => r.status === "invalid"),
      failed: failed.map(({ index, reason }) => ({ row: ready[index], reason })),
    })
    if (saved.length) toast.success(saved.length === 1 ? "1 cadastro importado." : `${saved.length} cadastros importados.`)
  }

  return (
    <>
      <ModalBody>
        <Stepper current={2} />
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Serão importados", value: summary.ok, tone: "text-success" },
            { label: "Duplicados", value: summary.duplicate, tone: "text-warning" },
            { label: "Inválidos", value: summary.invalid, tone: "text-danger" },
          ].map((k) => (
            <div key={k.label} className="rounded-[10px] border border-border bg-surface px-3 py-2.5">
              <p className={cn("tabular text-[20px] font-semibold leading-none", k.value ? k.tone : "text-subtle")}>{k.value}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{k.label}</p>
            </div>
          ))}
        </div>
        <FilterTabs
          ariaLabel="Linhas da planilha"
          layoutId="import-review"
          value={tab}
          onChange={setTab}
          className="mt-4"
          options={[
            { value: "ok", label: "A importar", count: summary.ok },
            { value: "duplicate", label: "Duplicados", count: summary.duplicate },
            { value: "invalid", label: "Inválidos", count: summary.invalid },
          ]}
        />
        <div className="mt-3">
          <RowList rows={rows.filter((r) => r.status === tab)} />
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Duplicados e inválidos não são importados. Corrija a planilha e importe de novo, se quiser.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onBack} disabled={importing}>
          Voltar
        </Button>
        <Button onClick={confirm} disabled={importing || !ready.length}>
          <Upload />
          {importing ? "Importando…" : ready.length === 1 ? "Importar 1 cadastro" : `Importar ${ready.length} cadastros`}
        </Button>
      </ModalFooter>
    </>
  )
}

/* -------------------------------- 4. relatório ------------------------------- */

function ReportStep({ report, onClose }: { report: Report; onClose: () => void }) {
  const problems = [
    ...report.failed.map(({ row, reason }) => ({ line: row.line, name: row.draft.name, situation: "Falha", reason })),
    ...report.duplicates.map((row) => ({ line: row.line, name: row.draft.name, situation: "Duplicado", reason: row.reasons.join(" ") })),
    ...report.invalid.map((row) => ({ line: row.line, name: row.draft.name, situation: "Inválido", reason: row.reasons.join(" ") })),
  ].sort((a, b) => a.line - b.line)

  const download = () =>
    downloadFile(
      `relatorio-importacao-${toLocalISO(getNow()).slice(0, 10)}.csv`,
      toCsv(
        ["Linha", "Nome", "Situação", "Motivo"],
        problems.map((p) => [p.line, p.name, p.situation, p.reason]),
      ),
      "text/csv;charset=utf-8",
    )

  const copy = () => {
    const text = problems.map((p) => `Linha ${p.line} — ${p.name || "(sem nome)"}: ${p.situation}. ${p.reason}`).join("\n")
    void navigator.clipboard?.writeText(text).then(() => toast.success("Relatório copiado."))
  }

  const cards = [
    { label: "Importados", value: report.imported, icon: CircleCheck, tone: "text-success" },
    { label: "Duplicados", value: report.duplicates.length, icon: Copy, tone: "text-warning" },
    { label: "Inválidos", value: report.invalid.length, icon: TriangleAlert, tone: "text-danger" },
    { label: "Falhas", value: report.failed.length, icon: CircleAlert, tone: "text-danger" },
  ]

  return (
    <>
      <ModalBody>
        <Stepper current={3} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cards.map((k) => (
            <div key={k.label} className="rounded-[10px] border border-border bg-surface px-3 py-2.5">
              <k.icon className={cn("size-4", k.value ? k.tone : "text-subtle")} />
              <p className="tabular mt-2 text-[20px] font-semibold leading-none">{k.value}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{k.label}</p>
            </div>
          ))}
        </div>
        {problems.length > 0 ? (
          <>
            <p className="mt-5 mb-2 text-[12.5px] font-medium">Não importados</p>
            <ul className="max-h-[300px] divide-y divide-border overflow-y-auto rounded-[10px] border border-border thin-scrollbar">
              {problems.map((p) => (
                <li key={`${p.situation}-${p.line}`} className="flex items-start gap-3 px-3 py-2">
                  <span className="tabular w-12 shrink-0 pt-0.5 text-[11.5px] text-subtle">linha {p.line}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{p.name || "(sem nome)"}</p>
                    <p className="text-[12px] text-muted-foreground">
                      <span className={p.situation === "Duplicado" ? "text-warning" : "text-danger"}>{p.situation}.</span> {p.reason}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-5 text-[13px] text-muted-foreground">Todas as linhas da planilha foram importadas.</p>
        )}
      </ModalBody>
      <ModalFooter>
        {problems.length > 0 && (
          <>
            <Button variant="ghost" onClick={copy}>
              <Copy /> Copiar
            </Button>
            <Button variant="secondary" onClick={download}>
              <Download /> Baixar relatório
            </Button>
          </>
        )}
        <Button onClick={onClose}>Concluir</Button>
      </ModalFooter>
    </>
  )
}
