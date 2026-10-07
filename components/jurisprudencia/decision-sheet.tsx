"use client"

import * as React from "react"
import Link from "next/link"
import { Bookmark, BookmarkCheck, ChevronDown, ExternalLink, FileJson, Link2, MessageSquare, Unlink } from "lucide-react"
import { jurisprudenceContext } from "@/components/ai/ai-context"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { toast } from "sonner"
import { cn } from "cn"
import { SideSheet } from "@/components/ui/side-sheet"
import { Button, buttonVariants } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { TextArea } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/empty-state"
import { useSession } from "@/lib/auth/session"
import { useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { fmtNumericDate } from "@/lib/core/dates"
import type { JurisprudenceDecision } from "@/lib/services/jurisprudence/types"
import { jurisApi, type DecisionResponse } from "./api"
import { DecisionAI } from "./decision-ai"
import { LinkDialog } from "./link-dialog"
import { decisionTitle } from "./result-row"

export interface DecisionChange {
  id: string
  saved?: boolean
  linked?: { processId: string; linked: boolean }
}

/**
 * Detalhe de uma decisão, como está na base (campo ausente não aparece — nada é
 * completado). Ações: salvar, vincular ao processo, fonte original e Análise da Íntegra.
 */
export function DecisionSheet({
  id,
  onOpenChange,
  processId,
  query,
  onChange,
}: {
  id?: string
  onOpenChange: (open: boolean) => void
  /** Processo de onde a pessoa veio: vira o padrão para comparar e vincular. */
  processId?: string
  query?: string
  onChange?: (change: DecisionChange) => void
}) {
  const [shown, setShown] = React.useState(id)
  if (id && id !== shown) setShown(id)
  return (
    <SideSheet open={!!id} onOpenChange={onOpenChange} title="Decisão" className="sm:w-[640px]">
      {shown && <SheetBody key={shown} id={shown} processId={processId} query={query} onChange={onChange} onClose={() => onOpenChange(false)} />}
    </SideSheet>
  )
}

function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium break-words">{children}</dd>
    </div>
  )
}

function Section({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = React.useState(!collapsible)
  return (
    <section className="border-t border-border/80 px-5 py-4 sm:px-6">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="touch-target relative flex w-full items-center justify-between text-left text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {title}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      ) : (
        <h3 className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">{title}</h3>
      )}
      {open && <div className="mt-2">{children}</div>}
    </section>
  )
}

const prose = "text-[13.5px] leading-relaxed whitespace-pre-line text-foreground"

function SheetBody({
  id,
  processId,
  query,
  onChange,
  onClose,
}: {
  id: string
  processId?: string
  query?: string
  onChange?: (change: DecisionChange) => void
  onClose: () => void
}) {
  const { can } = useSession()
  const lexa = useLexaAI()
  const data = useOfficeData()
  const [state, setState] = React.useState<{ loading: boolean; error?: string; value?: DecisionResponse }>({ loading: true })
  const [attempt, setAttempt] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [linking, setLinking] = React.useState(false)
  const [notes, setNotes] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    jurisApi
      .decision(id)
      .then((value) => {
        if (cancelled) return
        setState({ loading: false, value })
        setNotes(value.saved?.notes ?? "")
      })
      .catch((error: Error) => !cancelled && setState({ loading: false, error: error.message }))
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  if (state.loading) {
    return (
      <div className="space-y-4 p-6" aria-busy="true" aria-label="Carregando decisão">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (state.error || !state.value) {
    return <ErrorState title={state.error ?? "Não conseguimos abrir a decisão."} onRetry={() => (setState({ loading: true }), setAttempt((n) => n + 1))} />
  }

  const { decision: d, saved, linkedProcessIds } = state.value
  const update = (patch: Partial<DecisionResponse>) => setState((s) => (s.value ? { ...s, value: { ...s.value, ...patch } } : s))

  const toggleSave = async () => {
    setBusy(true)
    try {
      if (saved) {
        await jurisApi.unsave(d.id)
        update({ saved: null })
        toast.success("Removida das salvas.")
        onChange?.({ id: d.id, saved: false })
      } else {
        await jurisApi.save(d.id)
        update({ saved: { id: "", notes: undefined } })
        toast.success("Jurisprudência salva no escritório.")
        onChange?.({ id: d.id, saved: true })
      }
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveNotes = async () => {
    setBusy(true)
    try {
      await jurisApi.updateNotes(d.id, notes)
      update({ saved: { id: saved?.id ?? "", notes: notes.trim() || undefined } })
      toast.success("Observação salva.")
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const unlink = async (pid: string) => {
    try {
      await jurisApi.unlink(d.id, pid)
      update({ linkedProcessIds: linkedProcessIds.filter((x) => x !== pid) })
      onChange?.({ id: d.id, linked: { processId: pid, linked: false } })
      toast.success("Vínculo removido.")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const label = `${d.tribunal} · ${decisionTitle(d)}`

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-5 pt-5 pb-4 pr-12 sm:px-6">
        <p className="text-[11.5px] font-medium tracking-[0.08em] text-subtle uppercase">
          {[d.tribunal, d.degree, d.area, d.decisionType].filter(Boolean).join(" · ")}
        </p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.01em]">{decisionTitle(d)}</h2>
        {d.className && d.classCode && <p className="text-[13px] text-muted-foreground">{d.className}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {saved && (
            <StatusBadge tone="brand" size="sm" dot={false}>
              Salva no escritório
            </StatusBadge>
          )}
          {linkedProcessIds.length > 0 && (
            <StatusBadge tone="success" size="sm" dot={false}>
              Vinculada a {linkedProcessIds.length === 1 ? "1 processo" : `${linkedProcessIds.length} processos`}
            </StatusBadge>
          )}
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button size="sm" variant={saved ? "secondary" : "default"} onClick={toggleSave} disabled={busy}>
            {saved ? <BookmarkCheck /> : <Bookmark />} {saved ? "Remover das salvas" : "Salvar"}
          </Button>
          {can("processes.edit") && (
            <Button size="sm" variant="secondary" onClick={() => setLinking(true)}>
              <Link2 /> Vincular ao processo
            </Button>
          )}
          {d.sourceUrl && (
            <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <ExternalLink /> Ver fonte original
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // Um painel por vez: fecha a decisão e abre a conversa sobre ela.
              onClose()
              lexa.open(jurisprudenceContext(d.id, label))
            }}
          >
            <MessageSquare /> Perguntar sobre esta decisão
          </Button>
        </div>
      </header>

      <div className="px-5 pb-4 sm:px-6">
        <DecisionAI decisionId={d.id} processId={processId} query={query} />
      </div>

      <Section title="Identificação">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tribunal">{d.tribunal}</Field>
          <Field label="Processo">{d.processNumber && [d.classCode, d.processNumber].filter(Boolean).join(" ")}</Field>
          <Field label="Número de registro">{d.registryNumber}</Field>
          <Field label="Classe">{d.className ?? d.classCode}</Field>
          <Field label="Órgão julgador">{d.court}</Field>
          <Field label="Relator(a)">{d.rapporteur}</Field>
          <Field label="Data do julgamento">{d.judgmentDate && fmtNumericDate(d.judgmentDate)}</Field>
          <Field label="Publicação">{d.publication}</Field>
        </dl>
      </Section>

      {d.subject && (
        <Section title="Assunto">
          <p className="text-[13px] leading-relaxed font-medium">{d.subject}</p>
        </Section>
      )}

      <Section title="Ementa">
        <p className={prose}>{d.ementa}</p>
      </Section>

      {d.thesis && (
        <Section title="Tese jurídica">
          <p className={prose}>{d.thesis}</p>
        </Section>
      )}

      <Section title="Decisão">
        {d.decisionText ? (
          <p className={prose}>{d.decisionText}</p>
        ) : (
          <p className="text-[13px] text-muted-foreground">O texto da decisão não está disponível nesta fonte. Consulte a fonte original.</p>
        )}
      </Section>

      {d.legislation.length > 0 && (
        <Section title="Referências legislativas" collapsible>
          <ul className="space-y-1 text-[12.5px] text-foreground">
            {d.legislation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      {d.citedPrecedents && (
        <Section title="Jurisprudência citada" collapsible>
          <p className="text-[12.5px] leading-relaxed whitespace-pre-line">{d.citedPrecedents}</p>
        </Section>
      )}

      {d.notes && (
        <Section title="Notas" collapsible>
          <p className="text-[12.5px] leading-relaxed whitespace-pre-line">{d.notes}</p>
        </Section>
      )}

      {saved && (
        <Section title="Observações do escritório">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} placeholder="Ex.: usar na réplica do processo 103027." />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="secondary" onClick={saveNotes} disabled={busy || notes === (saved.notes ?? "")}>
              Salvar observação
            </Button>
          </div>
        </Section>
      )}

      {linkedProcessIds.length > 0 && (
        <Section title="Vinculada aos processos">
          <ul className="space-y-1">
            {linkedProcessIds.map((pid) => {
              const p = byId(data.processes, pid)
              return (
                <li key={pid} className="flex items-center justify-between gap-2 text-[13px]">
                  <Link href={`/processos/${pid}`} className="font-medium hover:underline">
                    Processo {p?.code ?? pid}
                  </Link>
                  {can("processes.edit") && (
                    <Button size="xs" variant="ghost" onClick={() => void unlink(pid)}>
                      <Unlink /> Desvincular
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <SourceFooter decision={d} />

      <LinkDialog
        decisionId={d.id}
        decisionLabel={label}
        open={linking}
        onOpenChange={setLinking}
        linkedIds={linkedProcessIds}
        onLinked={(pid) => {
          update({ linkedProcessIds: [...new Set([...linkedProcessIds, pid])] })
          onChange?.({ id: d.id, linked: { processId: pid, linked: true } })
        }}
      />
    </div>
  )
}

/** Crédito à fonte (exigido pela licença) e links oficiais. */
function SourceFooter({ decision: d }: { decision: JurisprudenceDecision }) {
  return (
    <footer className="mt-auto border-t border-border/80 bg-surface-muted/40 px-5 py-3.5 text-[12px] text-muted-foreground sm:px-6">
      <p>
        Fonte: <span className="font-medium text-foreground">{d.sourceLabel}</span> · dado público oficial. A Íntegra não altera o conteúdo da decisão.
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {d.sourceUrl && (
          <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-strong hover:underline">
            <ExternalLink className="size-3.5" /> Consulta do processo no {d.tribunal}
          </a>
        )}
        {d.fileUrl && (
          <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-strong hover:underline">
            <FileJson className="size-3.5" /> Arquivo de dados abertos
          </a>
        )}
      </p>
    </footer>
  )
}
