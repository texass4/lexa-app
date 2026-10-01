"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, CircleAlert, ExternalLink, EyeOff, FilePlus2, Hourglass, Link2, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { SideSheet } from "@/components/ui/side-sheet"
import { Button } from "@/components/ui/button"
import { NativeSelect, TextArea } from "@/components/ui/field"
import { StatusBadge } from "@/components/ui/status-badge"
import { useOfficeData } from "@/lib/store/office-store"
import { useUI } from "@/lib/store/ui-store"
import { Can, useSession } from "@/lib/auth/session"
import { getMembers, getUser } from "@/lib/auth/account"
import { fmtNumericDate } from "@/lib/core/dates"
import { formatCNJ, onlyDigits } from "@/lib/processos/cnj"
import { formatOab } from "@/lib/intimacoes/oab"
import { readableContent } from "@/lib/integrations/legal/djen/mapper"
import { KIND_LABEL, SOURCE_LABEL, isOpen, requiresAction, stateBadge, suggestedDeadline } from "@/lib/triagem/model"
import type { Intimacao, TriageItem } from "@/types"
import { useTriagem, type TriageEvent } from "./triagem-provider"
import { ConfirmPrazoDialog } from "./confirm-prazo-dialog"
import { AIPrivacyNote } from "@/components/ai/ai-privacy"

const ACTION_LABEL: Record<TriageEvent["action"], string> = {
  capturado: "registrou o evento",
  visualizou: "visualizou",
  vinculou: "vinculou ao processo",
  desvinculou: "desvinculou do processo",
  atribuiu: "trocou o responsável",
  marcou_revisao: "marcou para revisão",
  confirmou_prazo: "confirmou o prazo",
  rejeitou_prazo: "decidiu que não há prazo",
  ignorou: "ignorou",
  reabriu: "reabriu",
  interpretou: "interpretou (Íntegra IA)",
}

export const ACTION_TEXT: Record<"sim" | "nao" | "incerto", string> = { sim: "Sim", nao: "Não", incerto: "Incerto" }

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

/** Um evento da Triagem: interpretação, dados, original, sugestão de prazo, decisão e trilha de auditoria. */
export function TriageSheet({ item, onOpenChange }: { item?: TriageItem; onOpenChange: (open: boolean) => void }) {
  const [shown, setShown] = React.useState(item)
  if (item && item !== shown) setShown(item)
  const i = item ?? shown
  return (
    <SideSheet open={!!item} onOpenChange={onOpenChange} title={i ? `${KIND_LABEL[i.kind]} ${i.processNumber ?? ""}` : "Evento"}>
      {i && <SheetBody key={i.id} item={i} />}
    </SideSheet>
  )
}

type Pending = "sem_prazo" | "review" | "ignore" | null

const PENDING_COPY: Record<Exclude<Pending, null>, { placeholder: string; button: string; success: string }> = {
  sem_prazo: {
    placeholder: "Motivo (opcional): ex.: só ciência, sem prazo.",
    button: "Decidir sem prazo",
    success: "Decidido — nenhum prazo foi criado.",
  },
  review: { placeholder: "O que precisa ser revisado?", button: "Marcar para revisão", success: "Marcado para revisão." },
  ignore: { placeholder: "Por que não exige atenção? (opcional)", button: "Ignorar evento", success: "Evento ignorado." },
}

function SheetBody({ item: i }: { item: TriageItem }) {
  const data = useOfficeData()
  const { openDialog } = useUI()
  const { can } = useSession()
  const { oabs, link, assign, rejectPrazo, markReview, ignore, reopen, markViewed, events, intimacao } = useTriagem()
  const [history, setHistory] = React.useState<TriageEvent[] | null>(null)
  const [source, setSource] = React.useState<Intimacao | null | undefined>(i.intimacaoId ? undefined : null)
  const [confirming, setConfirming] = React.useState(false)
  const [pending, setPending] = React.useState<Pending>(null)
  const [note, setNote] = React.useState("")
  const [linkTo, setLinkTo] = React.useState("")
  const [awaitingProcess, setAwaitingProcess] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const process = data.processes.find((p) => p.id === i.processId)
  const client = data.clients.find((c) => c.id === (i.clientId ?? process?.clientId))
  const prazo = data.deadlines.find((d) => d.id === i.prazoId || d.triageItemId === i.id)
  const responsible = i.responsibleId ? getUser(i.responsibleId) : undefined
  const receivedBy = source ? oabs.filter((o) => source.oabIds.includes(o.id)) : []
  const suggested = suggestedDeadline(i)
  const action = requiresAction(i)
  const sameNumber = i.cnj ? data.processes.filter((p) => (p.cnj ?? onlyDigits(p.number)) === i.cnj) : []
  const open = isOpen(i)
  const badge = stateBadge(i)

  // Quem abriu fica na trilha (uma vez por pessoa); trilha e original são lidos do banco.
  React.useEffect(() => {
    markViewed(i.id)
    let cancelled = false
    void events(i.id).then((list) => !cancelled && setHistory(list))
    return () => {
      cancelled = true
    }
  }, [i.id, i.updatedAt, markViewed, events])

  React.useEffect(() => {
    if (!i.intimacaoId) return
    let cancelled = false
    void intimacao(i.intimacaoId).then((found) => !cancelled && setSource(found))
    return () => {
      cancelled = true
    }
  }, [i.intimacaoId, intimacao])

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

  const run = async (act: () => Promise<{ ok: boolean; message?: string }>, success: string) => {
    setBusy(true)
    const result = await act()
    setBusy(false)
    if (!result.ok) return toast.error(result.message)
    setPending(null)
    setNote("")
    toast.success(success)
  }

  const linkProcess = (processId: string) => {
    const target = data.processes.find((p) => p.id === processId)
    if (target) void run(() => link(i, target.id, target.clientId || undefined), `Vinculado ao processo ${target.code}.`)
  }

  const decide = () => {
    if (!pending) return
    const act = pending === "sem_prazo" ? () => rejectPrazo(i, note) : pending === "review" ? () => markReview(i, note) : () => ignore(i, note)
    void run(act, PENDING_COPY[pending].success)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-5 pt-5 pb-4 pr-12">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-subtle">
          {[KIND_LABEL[i.kind], SOURCE_LABEL[i.source], i.tribunal].filter(Boolean).join(" · ")}
        </p>
        <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.01em]">
          {process ? `Processo ${process.code}` : (i.processNumber ?? (i.cnj ? formatCNJ(i.cnj) : "Processo não informado"))}
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{i.title}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusBadge tone={badge.tone} size="sm">
            {badge.label}
          </StatusBadge>
          {!process && open && (
            <StatusBadge tone="violet" size="sm" dot={false}>
              Processo não cadastrado
            </StatusBadge>
          )}
          {i.linkMethod === "cnj" && (
            <StatusBadge tone="neutral" size="sm" dot={false}>
              Vinculado pelo CNJ
            </StatusBadge>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        {i.state === "em_revisao" && i.reviewReason && (
          <div className="mx-5 mb-4 flex gap-2 rounded-[10px] border border-danger/20 bg-danger-soft/40 px-3 py-2.5 text-[12.5px]">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" />
            <span>
              <span className="font-medium">Revisão manual: </span>
              {i.reviewReason}
            </span>
          </div>
        )}

        <Section title="Íntegra IA">
          {i.ai ? (
            <div className="space-y-2 text-[13px]">
              <p className="font-medium leading-relaxed">{i.ai.summary}</p>
              <p>
                <span className="text-muted-foreground">Exige ação: </span>
                <span className="font-semibold">{ACTION_TEXT[i.ai.requiresAction]}</span>
                {i.ai.reason && <span className="text-muted-foreground"> — {i.ai.reason}</span>}
              </p>
              {i.ai.term && (
                <p className="text-[12.5px] text-muted-foreground">
                  Prazo lido no teor: {i.ai.term.days} dias — “{i.ai.term.excerpt}”
                </p>
              )}
              {i.ai.discarded && <p className="text-[12px] text-subtle">{i.ai.discarded}</p>}
              <p className="flex items-center gap-1 text-[11.5px] text-subtle">
                <Sparkles className="size-3" /> Interpretado uma vez em {fmtDateTime(i.ai.generatedAt)}. Confira no original antes de decidir.
              </p>
              <AIPrivacyNote />
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              {i.aiStatus === "falhou"
                ? "A Íntegra IA não conseguiu interpretar este evento agora; uma nova tentativa é feita automaticamente. O original está abaixo."
                : open
                  ? "Interpretação da Íntegra IA ainda não disponível. O original está abaixo."
                  : "Sem interpretação da Íntegra IA."}
              {action?.by === "teor" && " O teor traz prazo explícito: exige ação."}
            </p>
          )}
        </Section>

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
            <Fact label={i.kind === "intimacao" ? "Publicação" : "Data do ato"}>{fmtNumericDate(i.eventDate)}</Fact>
            {i.availableAt && <Fact label="Disponibilizada">{fmtNumericDate(i.availableAt)}</Fact>}
            <Fact label="Responsável">
              {open && can("processes.edit") ? (
                <NativeSelect
                  aria-label="Responsável"
                  value={i.responsibleId ?? ""}
                  disabled={busy}
                  onChange={(e) => e.target.value && void run(() => assign(i, e.target.value), "Responsável atualizado.")}
                  className="h-8 w-auto text-[12.5px]"
                >
                  {!i.responsibleId && <option value="">Sem responsável</option>}
                  {getMembers().map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                (responsible?.name ?? "—")
              )}
            </Fact>
            {i.kind === "intimacao" && <Fact label="OAB">{receivedBy.length ? receivedBy.map(formatOab).join(", ") : "—"}</Fact>}
            <Fact label="Origem">{[SOURCE_LABEL[i.source], i.orgao].filter(Boolean).join(" · ")}</Fact>
            {source?.classe && <Fact label="Classe">{source.classe}</Fact>}
          </dl>
          {source && (source.officialUrl || source.documentUrl) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {source.officialUrl && (
                <a
                  href={source.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-strong hover:underline"
                >
                  <ShieldCheck className="size-3.5" /> Certidão no DJEN <ExternalLink className="size-3" />
                </a>
              )}
              {source.documentUrl && (
                <a
                  href={source.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-strong hover:underline"
                >
                  Documento na fonte <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}
        </Section>

        <Section title={i.kind === "intimacao" ? "Teor integral" : "Movimentação"}>
          {i.kind === "intimacao" ? (
            source === undefined ? (
              <p className="text-[12.5px] text-muted-foreground">Carregando…</p>
            ) : (
              <p className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-border bg-surface-muted/30 px-3 py-2.5 text-[12.5px] leading-relaxed thin-scrollbar">
                {source ? readableContent(source.content) : i.excerpt}
              </p>
            )
          ) : (
            <div className="rounded-[10px] border border-border bg-surface-muted/30 px-3 py-2.5 text-[12.5px] leading-relaxed">
              <p className="font-medium">{i.title}</p>
              {i.excerpt && <p className="mt-0.5 text-muted-foreground">{i.excerpt}</p>}
            </div>
          )}
          <p className="mt-1.5 text-[11.5px] text-subtle">Como veio da fonte ({SOURCE_LABEL[i.source]}). Guardado sem alteração.</p>
        </Section>

        {(suggested || i.suggestion) && (
          <Section title="Sugestão de prazo">
            {suggested ? (
              <p className="text-[14px] font-semibold">
                Data fatal sugerida: {fmtNumericDate(suggested.fatalDate)}
                <span className="ml-1.5 text-[12.5px] font-normal text-muted-foreground">
                  ({suggested.days} dias {suggested.unit === "corridos" ? "corridos" : "úteis"}
                  {suggested.from === "ia" ? ", lidos pela Íntegra IA" : ""})
                </span>
              </p>
            ) : (
              <p className="text-[13px] font-medium">Sem data sugerida — o prazo precisa ser informado por quem confirma.</p>
            )}
            {suggested?.excerpt && <p className="mt-1.5 text-[12.5px] text-muted-foreground">No teor: “{suggested.excerpt}”</p>}
            {!!i.suggestion?.reasons.length && (
              <ul className="mt-2.5 space-y-1 rounded-[10px] border border-danger/20 bg-danger-soft/40 px-3 py-2">
                {i.suggestion.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2 text-[12.5px]">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" /> {reason}
                  </li>
                ))}
              </ul>
            )}
            {!!(suggested?.basis ?? i.suggestion?.basis)?.length && (
              <>
                <p className="mt-3 text-[11.5px] font-medium text-muted-foreground">Como a data foi calculada</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[12px] text-muted-foreground">
                  {(suggested?.basis ?? i.suggestion?.basis ?? []).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </>
            )}
            <p className="mt-2 text-[11.5px] leading-relaxed text-subtle">{i.suggestion?.caveat} Nenhum prazo é criado sem confirmação.</p>
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
                  {e.action === "atribuiu" && typeof e.detail.responsibleId === "string" ? ` para ${getUser(e.detail.responsibleId).name}` : ""}
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
          {pending ? (
            <>
              <TextArea
                aria-label="Observação"
                placeholder={PENDING_COPY[pending].placeholder}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 1000))}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setPending(null)}>
                  Voltar
                </Button>
                <Button variant={pending === "review" ? "default" : "destructive"} disabled={busy} onClick={decide}>
                  {PENDING_COPY[pending].button}
                </Button>
              </div>
            </>
          ) : open && !i.processId ? (
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
                <Button variant="ghost" onClick={() => setPending("ignore")}>
                  <EyeOff /> Ignorar
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
              <Button variant="ghost" onClick={() => setPending("ignore")}>
                <EyeOff /> Ignorar
              </Button>
              <Button variant="ghost" onClick={() => setPending("sem_prazo")}>
                <X /> Sem prazo
              </Button>
              {i.state === "pendente" && (
                <Button variant="secondary" onClick={() => setPending("review")}>
                  Revisar depois
                </Button>
              )}
              <Button onClick={() => setConfirming(true)}>
                <Hourglass /> Confirmar prazo
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {prazo ? (
                <Link
                  href={`/processos/${prazo.processId}`}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-strong hover:underline"
                >
                  Prazo criado: {prazo.description} · fatal em {fmtNumericDate(prazo.fatalDate)} <ArrowUpRight className="size-3.5" />
                </Link>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">
                  {i.state === "ignorado" ? "Ignorado" : i.decision === "sem_prazo" ? "Decidido sem prazo" : "Decidido"}
                  {i.decidedBy ? ` por ${getUser(i.decidedBy).name}` : ""}
                  {i.decidedAt ? ` em ${fmtDateTime(i.decidedAt)}` : ""}.
                </p>
              )}
              {i.decision !== "prazo_criado" && (
                <Button variant="secondary" disabled={busy} onClick={() => void run(() => reopen(i), "Evento reaberto.")}>
                  <RotateCcw /> Reabrir
                </Button>
              )}
            </div>
          )}
        </footer>
      </Can>
      <ConfirmPrazoDialog item={confirming ? i : undefined} onOpenChange={(o) => !o && setConfirming(false)} />
    </div>
  )
}
