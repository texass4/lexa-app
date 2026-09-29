"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, CircleAlert, ExternalLink, FilePlus2, Hourglass, Link2, ShieldCheck, X } from "lucide-react"
import { toast } from "sonner"
import { SideSheet } from "@/components/ui/side-sheet"
import { Button } from "@/components/ui/button"
import { NativeSelect, TextArea } from "@/components/ui/field"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { Can } from "@/lib/auth/session"
import { getUser } from "@/lib/account"
import { fmtNumericDate } from "@/lib/dates"
import { formatCNJ, onlyDigits } from "@/lib/cnj"
import { formatOab } from "@/lib/intimacoes/oab"
import { TRIAGE_STATUS } from "@/lib/intimacoes/rows"
import { readableContent } from "@/lib/integrations/legal/djen/mapper"
import type { Intimacao } from "@/types"
import { useIntimacoes, type IntimacaoEvent } from "./intimacoes-provider"
import { ConfirmPrazoDialog } from "./confirm-prazo-dialog"

const ACTION_LABEL: Record<IntimacaoEvent["action"], string> = {
  capturada: "capturou a intimação no DJEN",
  visualizou: "visualizou",
  vinculou: "vinculou ao processo",
  desvinculou: "desvinculou do processo",
  atribuiu: "trocou o responsável",
  confirmou_prazo: "confirmou o prazo",
  rejeitou_prazo: "rejeitou o prazo",
  marcou_revisao: "marcou para revisão",
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] font-medium break-words">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle">{title}</p>
      {children}
    </section>
  )
}

/** Uma intimação: dados da fonte, teor original, sugestão de prazo, ações da triagem e a trilha de auditoria. */
export function IntimacaoSheet({ intimacao, onOpenChange }: { intimacao?: Intimacao; onOpenChange: (open: boolean) => void }) {
  const [shown, setShown] = React.useState(intimacao)
  if (intimacao && intimacao !== shown) setShown(intimacao)
  const i = intimacao ?? shown
  return (
    <SideSheet open={!!intimacao} onOpenChange={onOpenChange} title={i ? `Intimação ${i.processNumber ?? ""}` : "Intimação"}>
      {i && <SheetBody key={i.id} intimacao={i} />}
    </SideSheet>
  )
}

function SheetBody({ intimacao: i }: { intimacao: Intimacao }) {
  const data = useDemoData()
  const { openDialog } = useUI()
  const { oabs, link, reject, markReview, markViewed, events } = useIntimacoes()
  const [history, setHistory] = React.useState<IntimacaoEvent[] | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [decision, setDecision] = React.useState<"reject" | "review" | null>(null)
  const [note, setNote] = React.useState("")
  const [linkTo, setLinkTo] = React.useState("")
  const [awaitingProcess, setAwaitingProcess] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const process = data.processes.find((p) => p.id === i.processId)
  const client = data.clients.find((c) => c.id === (i.clientId ?? process?.clientId))
  const prazo = data.deadlines.find((d) => d.id === i.prazoId || d.intimacaoId === i.id)
  const receivedBy = oabs.filter((o) => i.oabIds.includes(o.id))
  const responsible = i.responsibleId ? getUser(i.responsibleId) : undefined
  const suggestion = i.suggestion
  const sameNumber = i.cnj ? data.processes.filter((p) => (p.cnj ?? onlyDigits(p.number)) === i.cnj) : []
  const open = i.status === "pendente" || i.status === "revisao" || i.status === "sem_processo"

  // Quem abriu fica na trilha (uma vez por pessoa); a trilha é lida do banco.
  React.useEffect(() => {
    markViewed(i.id)
    let cancelled = false
    void events(i.id).then((list) => !cancelled && setHistory(list))
    return () => {
      cancelled = true
    }
  }, [i.id, i.updatedAt, markViewed, events])

  // Cadastro de processo feito a partir daqui: quando ele aparece, vincula (a pessoa acabou de validar).
  const created = awaitingProcess && sameNumber.length === 1 ? sameNumber[0] : undefined
  const linking = React.useRef(false)
  React.useEffect(() => {
    if (!created || i.processId || linking.current) return
    linking.current = true
    void link(i, created.id, created.clientId || undefined).then((r) => {
      linking.current = false
      setAwaitingProcess(false)
      if (r.ok) toast.success("Processo cadastrado e vinculado.", { description: created.code })
      else toast.error(r.message)
    })
  }, [created, i, link])

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>, success: string) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result.ok) return toast.error(result.message)
    setDecision(null)
    setNote("")
    toast.success(success)
  }

  const linkProcess = (processId: string) => {
    const target = data.processes.find((p) => p.id === processId)
    if (target) void run(() => link(i, target.id, target.clientId || undefined), `Vinculada ao processo ${target.code}.`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-5 pt-5 pb-4 pr-12">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-subtle">
          {[i.tipoComunicacao ?? "Comunicação", i.tribunal].filter(Boolean).join(" · ")}
        </p>
        <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.01em]">
          {process ? `Processo ${process.code}` : (i.processNumber ?? (i.cnj ? formatCNJ(i.cnj) : "Processo não informado"))}
        </h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusBadge tone={TRIAGE_STATUS[i.status].tone} size="sm">
            {TRIAGE_STATUS[i.status].label}
          </StatusBadge>
          {i.linkMethod === "cnj" && (
            <StatusBadge tone="neutral" size="sm" dot={false}>
              Vinculada pelo CNJ
            </StatusBadge>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        <Section title="Dados">
          <dl className="divide-y divide-border">
            <Fact label="Processo">
              {process ? (
                <Link href={`/processos/${process.id}`} className="hover:underline">
                  {process.code} · {process.number}
                </Link>
              ) : (
                <span className="text-violet">Não cadastrado{i.cnj ? ` · ${formatCNJ(i.cnj)}` : ""}</span>
              )}
            </Fact>
            <Fact label="Cliente">
              {client ? (
                <Link href={`/clientes/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Disponibilizada">{fmtNumericDate(i.availableAt)}</Fact>
            <Fact label="Publicação">{i.publishedAt ? fmtNumericDate(i.publishedAt) : "—"}</Fact>
            <Fact label="Responsável">{responsible?.name ?? "—"}</Fact>
            <Fact label="OAB">{receivedBy.length ? receivedBy.map(formatOab).join(", ") : "—"}</Fact>
            <Fact label="Origem">{["DJEN", i.orgao].filter(Boolean).join(" · ")}</Fact>
            {i.classe && <Fact label="Classe">{i.classe}</Fact>}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {i.officialUrl && (
              <a
                href={i.officialUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-strong hover:underline"
              >
                <ShieldCheck className="size-3.5" /> Certidão no DJEN <ExternalLink className="size-3" />
              </a>
            )}
            {i.documentUrl && (
              <a
                href={i.documentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-strong hover:underline"
              >
                Documento na fonte <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </Section>

        <Section title="Teor integral">
          <p className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-border bg-surface-muted/30 px-3 py-2.5 text-[12.5px] leading-relaxed thin-scrollbar">
            {readableContent(i.content)}
          </p>
          <p className="mt-1.5 text-[11.5px] text-subtle">Texto como publicado na fonte. Guardado sem alteração.</p>
        </Section>

        {suggestion && (
          <Section title="Sugestão de prazo">
            {suggestion.fatalDate ? (
              <p className="text-[14px] font-semibold">
                Data fatal sugerida: {fmtNumericDate(suggestion.fatalDate)}
                <span className="ml-1.5 text-[12.5px] font-normal text-muted-foreground">
                  ({suggestion.days} dias {suggestion.unit === "corridos" ? "corridos" : "úteis"})
                </span>
              </p>
            ) : (
              <p className="text-[13px] font-medium">Sem data sugerida — o prazo precisa ser informado por quem confirma.</p>
            )}
            {suggestion.excerpt && <p className="mt-1.5 text-[12.5px] text-muted-foreground">No teor: “{suggestion.excerpt}”</p>}
            {suggestion.reasons.length > 0 && (
              <ul className="mt-2.5 space-y-1 rounded-[10px] border border-danger/20 bg-danger-soft/40 px-3 py-2">
                {suggestion.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2 text-[12.5px]">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" /> {reason}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11.5px] font-medium text-muted-foreground">Como a data foi calculada</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[12px] text-muted-foreground">
              {suggestion.basis.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            <p className="mt-2 text-[11.5px] leading-relaxed text-subtle">{suggestion.caveat} Nenhum prazo é criado sem confirmação.</p>
          </Section>
        )}

        {i.decisionNote && (
          <Section title="Observação">
            <p className="text-[13px]">{i.decisionNote}</p>
          </Section>
        )}

        <Section title="Histórico">
          {!history ? (
            <p className="text-[12.5px] text-muted-foreground">Carregando…</p>
          ) : (
            <ol className="space-y-1.5">
              {history.map((e) => (
                <li key={e.id} className="text-[12.5px]">
                  <span className="font-medium">{e.actorId ? getUser(e.actorId).name : "Íntegra"}</span> {ACTION_LABEL[e.action]}
                  {e.action === "vinculou" && e.detail.processId ? ` ${data.processes.find((p) => p.id === e.detail.processId)?.code ?? ""}` : ""}
                  {typeof e.detail.note === "string" && e.detail.note ? ` — “${e.detail.note}”` : ""}
                  <span className="text-subtle"> · {fmtDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      <Can permission="processes.edit">
        <footer className="shrink-0 space-y-2.5 border-t border-border px-5 py-3.5">
          {decision ? (
            <>
              <TextArea
                aria-label="Motivo (opcional)"
                placeholder={decision === "reject" ? "Motivo (opcional): ex.: só ciência, sem prazo." : "O que precisa ser revisado?"}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 1000))}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDecision(null)}>
                  Voltar
                </Button>
                <Button
                  variant={decision === "reject" ? "destructive" : "default"}
                  disabled={busy}
                  onClick={() =>
                    decision === "reject"
                      ? void run(() => reject(i, note), "Rejeitada — nenhum prazo foi criado.")
                      : void run(() => markReview(i, note), "Marcada para revisão.")
                  }
                >
                  {decision === "reject" ? "Rejeitar prazo" : "Marcar para revisão"}
                </Button>
              </div>
            </>
          ) : i.status === "sem_processo" || (!i.processId && open) ? (
            <>
              <div className="flex gap-2">
                <NativeSelect
                  aria-label="Processo para vincular"
                  value={linkTo}
                  onChange={(e) => setLinkTo(e.target.value)}
                  className="h-9 min-w-0 flex-1 text-[13px]"
                >
                  <option value="">Vincular a um processo…</option>
                  {[...sameNumber, ...data.processes.filter((p) => !sameNumber.includes(p))].map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.number}
                      {sameNumber.includes(p) ? " (mesmo número)" : ""}
                    </option>
                  ))}
                </NativeSelect>
                <Button variant="secondary" disabled={!linkTo || busy} onClick={() => linkProcess(linkTo)}>
                  <Link2 /> Vincular
                </Button>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setDecision("reject")}>
                  <X /> Rejeitar
                </Button>
                {i.cnj && !sameNumber.length && (
                  <Button
                    onClick={() => {
                      setAwaitingProcess(true)
                      openDialog("process", { number: i.cnj, clientId: undefined })
                    }}
                  >
                    <FilePlus2 /> Cadastrar processo
                  </Button>
                )}
              </div>
            </>
          ) : open ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setDecision("reject")}>
                <X /> Rejeitar
              </Button>
              {i.status === "pendente" && (
                <Button variant="secondary" onClick={() => setDecision("review")}>
                  Revisar depois
                </Button>
              )}
              <Button onClick={() => setConfirming(true)}>
                <Hourglass /> Confirmar prazo
              </Button>
            </div>
          ) : prazo ? (
            <Link
              href={`/processos/${prazo.processId}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-strong hover:underline"
            >
              Prazo criado: {prazo.description} · fatal em {fmtNumericDate(prazo.fatalDate)} <ArrowUpRight className="size-3.5" />
            </Link>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">{i.status === "rejeitada" ? "Rejeitada — nenhum prazo criado." : "Decidida."}</p>
          )}
        </footer>
      </Can>
      <ConfirmPrazoDialog intimacao={confirming ? i : undefined} onOpenChange={(o) => !o && setConfirming(false)} />
    </div>
  )
}
