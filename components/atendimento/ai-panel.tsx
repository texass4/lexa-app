"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowUpRight,
  FileSearch,
  ListChecks,
  Lock,
  MessageSquareQuote,
  NotebookPen,
  Scale,
  ShieldCheck,
  Sparkles,
  TextQuote,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"
import { PRIORITY_CONFIG } from "@/lib/config"
import { addDays, fmtDayLabel, getNow, startOfDay, toLocalISO } from "@/lib/dates"
import { whatsappApi, type AiAction, type AiResponse } from "@/lib/whatsapp/client"
import type { WhatsAppConversation } from "@/types"
import { ConfirmActionDialog } from "./dialogs"
import { draftStore } from "./drafts"

const ACTIONS: { action: AiAction; label: string; icon: React.ReactNode; hint: string }[] = [
  { action: "summary", label: "Resumir conversa", icon: <TextQuote />, hint: "Fatos, pedidos e pendências" },
  { action: "reply", label: "Sugerir resposta", icon: <MessageSquareQuote />, hint: "Rascunho para você revisar" },
  { action: "tasks", label: "Identificar tarefas", icon: <ListChecks />, hint: "O que o escritório precisa fazer" },
  { action: "processes", label: "Identificar processos", icon: <Scale />, hint: "Menções e processos do cliente" },
  { action: "documents", label: "Analisar documentos", icon: <FileSearch />, hint: "Imagens e PDFs recebidos" },
  { action: "internal_summary", label: "Resumo interno", icon: <NotebookPen />, hint: "Nota para a equipe" },
]

type Pending = { kind: "note"; text: string } | { kind: "task"; index: number } | null

export function AiPanel({ conversation, onUseReply }: { conversation: WhatsAppConversation; onUseReply: () => void }) {
  const { can, user } = useSession()
  const data = useDemoData()
  const { addTask } = useDemoActions()
  const { openDialog } = useUI()
  const [configured, setConfigured] = React.useState<boolean | null>(null)
  const [running, setRunning] = React.useState<AiAction | null>(null)
  const [result, setResult] = React.useState<{ conversationId: string; response: AiResponse } | null>(null)
  const [pending, setPending] = React.useState<Pending>(null)
  const [created, setCreated] = React.useState<Set<number>>(new Set())
  const clientId = conversation.contact.clientId
  const current = result?.conversationId === conversation.id ? result.response : null

  React.useEffect(() => {
    whatsappApi
      .aiStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false))
  }, [])

  const run = async (action: AiAction) => {
    setRunning(action)
    setCreated(new Set())
    try {
      const response = await whatsappApi.ai(conversation.id, action)
      setResult({ conversationId: conversation.id, response })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A Lexa IA não respondeu.")
    } finally {
      setRunning(null)
    }
  }

  const saveNote = async (text: string) => {
    try {
      await whatsappApi.send(conversation.id, { id: crypto.randomUUID(), type: "note", text: `✨ Lexa IA\n${text}` })
      toast.success("Nota interna salva na conversa.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a nota.")
    }
  }

  const tasks = current?.action === "tasks" ? current.result.tasks : []
  const createTask = (index: number) => {
    const t = tasks[index]
    if (!t) return
    const due = t.dueInDays === null ? addDays(startOfDay(getNow()), 1) : addDays(startOfDay(getNow()), Math.max(0, t.dueInDays))
    due.setHours(18, 0, 0, 0)
    addTask({
      title: t.title,
      description: t.description,
      dueAt: toLocalISO(due),
      priority: t.priority,
      assigneeId: conversation.assignedUserId ?? user.id,
      related: clientId ? { type: "client", id: clientId } : undefined,
    })
    setCreated((set) => new Set(set).add(index))
    toast.success("Tarefa criada.", { description: t.title })
  }

  if (configured === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-gold/25 bg-gold-soft text-gold-dark">
          <Sparkles className="size-5" />
        </span>
        <p className="text-[14px] font-semibold">Lexa IA não configurada</p>
        <p className="mt-1 max-w-[260px] text-[12.5px] leading-relaxed text-muted-foreground">
          Defina <code className="font-mono">ANTHROPIC_API_KEY</code> no servidor para resumir conversas, sugerir respostas e identificar tarefas.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-gradient-to-br from-gold to-gold-dark text-white shadow-xs">
            <Sparkles className="size-3.5" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold leading-tight">Lexa IA</p>
            <p className="text-[11.5px] text-muted-foreground">Sugere. Você decide o que fazer.</p>
          </div>
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a.action}
              type="button"
              disabled={!!running || configured === null}
              onClick={() => run(a.action)}
              className={cn(
                "group flex flex-col items-start gap-1 rounded-[11px] border border-border bg-surface px-2.5 py-2 text-left outline-none transition-[border-color,background-color] hover:border-gold/40 hover:bg-gold-soft/40 focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-60",
                current?.action === a.action && "border-gold/50 bg-gold-soft/50",
              )}
            >
              <span className="text-gold-dark [&_svg]:size-4">{a.icon}</span>
              <span className="text-[12.5px] leading-tight font-medium">{a.label}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{a.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-4 thin-scrollbar">
        <AnimatePresence mode="wait">
          {running ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5" aria-busy="true">
              <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Sparkles className="size-3.5 animate-pulse text-gold" /> Lendo a conversa…
              </p>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
            </motion.div>
          ) : current ? (
            <motion.div key={current.action} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 text-[13px] leading-relaxed">
              {current.action === "summary" && (
                <>
                  <p>{current.result.summary}</p>
                  {current.result.keyPoints.length > 0 && <List title="Pontos-chave" items={current.result.keyPoints} />}
                  {current.result.pendingQuestions.length > 0 && <List title="Pendências" items={current.result.pendingQuestions} />}
                  {can("whatsapp.edit") && (
                    <Button variant="secondary" size="sm" onClick={() => setPending({ kind: "note", text: summaryText(current) })}>
                      <Lock /> Salvar como nota interna
                    </Button>
                  )}
                </>
              )}

              {current.action === "reply" && (
                <>
                  <div className="rounded-[12px] border border-border bg-surface p-3 whitespace-pre-wrap">{current.result.reply}</div>
                  <p className="text-[12px] text-muted-foreground">{current.result.rationale}</p>
                  {can("whatsapp.edit") && (
                    <Button
                      size="sm"
                      onClick={() => {
                        draftStore.set(conversation.id, { text: current.result.reply, mode: "reply" })
                        onUseReply()
                        toast("Resposta colocada no campo de mensagem.", { description: "Revise e clique em Enviar — nada foi enviado." })
                      }}
                    >
                      Usar no campo de resposta
                    </Button>
                  )}
                </>
              )}

              {current.action === "tasks" &&
                (tasks.length ? (
                  <ul className="space-y-2">
                    {tasks.map((t, i) => (
                      <li key={i} className="rounded-[12px] border border-border bg-surface p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{t.title}</p>
                          <StatusBadge tone={PRIORITY_CONFIG[t.priority].tone} size="sm">
                            {PRIORITY_CONFIG[t.priority].label}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">{t.description}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11.5px] text-subtle">
                            {t.dueInDays === null ? "Sem prazo sugerido" : `Prazo: ${fmtDayLabel(toLocalISO(addDays(getNow(), t.dueInDays)))}`}
                          </span>
                          {can("tasks.edit") &&
                            (created.has(i) ? (
                              <span className="text-[12px] font-medium text-success">Criada</span>
                            ) : (
                              <Button variant="secondary" size="xs" onClick={() => setPending({ kind: "task", index: i })}>
                                Criar tarefa
                              </Button>
                            ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">Nenhuma tarefa identificada nesta conversa.</p>
                ))}

              {current.action === "processes" && (
                <>
                  {current.result.mentions.length ? (
                    <ul className="space-y-2">
                      {current.result.mentions.map((m, i) => {
                        const process = m.processNumber ? data.processes.find((p) => p.number === m.processNumber || p.code === m.processNumber) : undefined
                        return (
                          <li key={i} className="rounded-[12px] border border-border bg-surface p-3">
                            <p className="font-medium">“{m.reference}”</p>
                            <p className="mt-1 text-[12.5px] text-muted-foreground">{m.note}</p>
                            {process && (
                              <Link href={`/processos/${process.id}`} className="mt-1.5 inline-flex items-center gap-0.5 text-[12px] font-medium text-gold-dark hover:underline">
                                Abrir processo {process.number || process.code} <ArrowUpRight className="size-3.5" />
                              </Link>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Nenhum processo mencionado.</p>
                  )}
                  {current.result.suggestion && (
                    <div className="rounded-[12px] border border-gold/25 bg-gold-soft/50 p-3">
                      <p className="text-[12.5px]">{current.result.suggestion}</p>
                      {clientId && can("processes.edit") && (
                        <Button variant="secondary" size="xs" className="mt-2" onClick={() => openDialog("process", { clientId })}>
                          Cadastrar processo
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}

              {current.action === "documents" && (
                <ul className="space-y-2">
                  {current.result.documents.map((d, i) => (
                    <li key={i} className="rounded-[12px] border border-border bg-surface p-3">
                      <p className="font-medium">{d.fileName}</p>
                      <p className="text-[11.5px] tracking-wide text-gold-dark uppercase">{d.kind}</p>
                      <p className="mt-1.5 text-[12.5px] text-muted-foreground">{d.summary}</p>
                      {d.relevantFacts.length > 0 && <List title="Informações" items={d.relevantFacts} />}
                      {d.concerns.length > 0 && <List title="Atenção" items={d.concerns} tone="warning" />}
                    </li>
                  ))}
                </ul>
              )}

              {current.action === "internal_summary" && (
                <>
                  <div className="rounded-[12px] border border-dashed border-gold/45 bg-gold-soft p-3 whitespace-pre-wrap">{current.result.note}</div>
                  {can("whatsapp.edit") && (
                    <Button size="sm" variant="gold" onClick={() => setPending({ kind: "note", text: current.result.note })}>
                      <Lock /> Salvar como nota interna
                    </Button>
                  )}
                </>
              )}
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center px-2 pt-6 text-center">
              <ShieldCheck className="size-5 text-subtle" />
              <p className="mt-2 max-w-[250px] text-[12.5px] leading-relaxed text-muted-foreground">
                A Lexa IA lê esta conversa e sugere. Nenhuma mensagem é enviada e nada é criado sem a sua confirmação.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.kind === "task" ? "Criar esta tarefa?" : "Salvar nota interna?"}
        description={pending?.kind === "task" ? "A tarefa entra no quadro do escritório, ligada a este cliente." : "Fica na conversa, visível só para a equipe."}
        confirmLabel={pending?.kind === "task" ? "Criar tarefa" : "Salvar nota"}
        icon={<Sparkles />}
        onConfirm={async () => {
          if (pending?.kind === "task") createTask(pending.index)
          if (pending?.kind === "note") await saveNote(pending.text)
        }}
      >
        {pending?.kind === "task" && tasks[pending.index] && (
          <div className="rounded-[12px] border border-border bg-surface-muted/50 p-3 text-[13px]">
            <p className="font-medium">{tasks[pending.index].title}</p>
            <p className="mt-1 text-muted-foreground">{tasks[pending.index].description}</p>
          </div>
        )}
        {pending?.kind === "note" && <div className="max-h-60 overflow-y-auto rounded-[12px] border border-dashed border-gold/45 bg-gold-soft p-3 text-[13px] whitespace-pre-wrap">{pending.text}</div>}
      </ConfirmActionDialog>
    </div>
  )
}

function summaryText(response: Extract<AiResponse, { action: "summary" }>) {
  const { summary, keyPoints, pendingQuestions } = response.result
  return [summary, keyPoints.length ? `\nPontos-chave:\n${keyPoints.map((p) => `• ${p}`).join("\n")}` : "", pendingQuestions.length ? `\nPendências:\n${pendingQuestions.map((p) => `• ${p}`).join("\n")}` : ""]
    .filter(Boolean)
    .join("\n")
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: "warning" }) {
  return (
    <div>
      <p className={cn("mb-1 text-[11px] font-medium tracking-[0.08em] uppercase", tone === "warning" ? "text-warning" : "text-muted-foreground")}>{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-[12.5px]">
            <span className={cn("mt-[7px] size-1 shrink-0 rounded-full", tone === "warning" ? "bg-warning" : "bg-gold")} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
