"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Ellipsis, FileText, Link2, ListChecks, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { SideSheet } from "@/components/ui/side-sheet"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Eyebrow } from "@/components/ui/panel"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CLIENT_STATUS, PRAZO_STATUS, PRIORITY_CONFIG, PROCESS_STATUS } from "@/lib/core/config"
import { fmtActivityTime, fmtDueIn, fmtNumericDate, fmtRelative } from "@/lib/core/dates"
import { uid } from "@/lib/core/format"
import { getMembers, getUser } from "@/lib/auth/account"
import { useSession } from "@/lib/auth/session"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import { nextPrazo, taskPrazo } from "@/lib/prazos/prazos"
import { clientContext, processContext, taskPrompts } from "@/components/ai/ai-context"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { processNumberLabel, processTitle } from "@/lib/processos/label"
import { checklistProgress, columnOfTask, dueGroup, PRIORITIES } from "@/lib/tarefas/workspace"
import { usePages } from "@/lib/paginas/pages"
import { pageHref, pageTitle, type PageMeta } from "@/lib/paginas/model"
import type { Priority, RelatedEntity, Task } from "@/types"
import { PRIORITY_STYLE } from "./task-card"

/**
 * O que está em volta da tarefa: o processo (prazo, última movimentação) ou o
 * cliente — e perguntas da Íntegra sobre ela, com os dados desse contexto.
 */
/**
 * Páginas ligadas à tarefa: a de origem (onde foi criada) e as que a mostram. A tarefa não
 * é copiada para a página — é a mesma, e a lista vem da referência guardada no banco.
 */
function TaskPages({ task }: { task: Task }) {
  const { status, list, pages } = usePages()
  if (status !== "ready") return null
  const origin = task.pageId ? pages.get(task.pageId) : undefined
  const shownIn = list.filter((p) => p.id !== task.pageId && p.taskIds.includes(task.id))
  if (!task.pageId && !shownIn.length) return null
  const item = (p: PageMeta, hint?: string) => (
    <li key={p.id}>
      <Link
        href={pageHref(p.id)}
        className="flex min-w-0 items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
        <span className="truncate">{pageTitle(p)}</span>
        {hint && <span className="ml-auto shrink-0 text-[11.5px] text-muted-foreground">{hint}</span>}
      </Link>
    </li>
  )
  return (
    <section aria-label="Páginas">
      <Eyebrow className="mb-1.5">Páginas</Eyebrow>
      <ul className="-mx-2 space-y-0.5">
        {origin && item(origin, "criada aqui")}
        {task.pageId && !origin && <li className="px-2 py-1 text-[12.5px] text-muted-foreground">Criada numa página excluída ou sem acesso.</li>}
        {shownIn.map((p) => item(p))}
      </ul>
    </section>
  )
}

function TaskContext({ task, onBeforeAsk }: { task: Task; onBeforeAsk: () => void }) {
  const data = useOfficeData()
  const lexa = useLexaAI()
  const { can } = useSession()
  const related = task.related
  const process = related?.type === "process" && can("processes.view") ? byId(data.processes, related.id) : undefined
  const client =
    related?.type === "client" && can("clients.view")
      ? byId(data.clients, related.id)
      : process && can("clients.view")
        ? byId(data.clients, process.clientId)
        : undefined

  if (!process && !client) {
    return (
      <p className="rounded-[12px] border border-dashed border-border px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        Esta tarefa não está ligada a um processo ou cliente. Vincule em “Editar” para ver o contexto aqui e perguntar à Íntegra sobre ela.
      </p>
    )
  }

  const aiContext = process ? processContext(process.id, process.code) : clientContext(client!.id, client!.name)
  const prompts = taskPrompts(task.title, process ? "process" : "client")
  const lastMovement = process?.movements.length ? process.lastMovementAt : undefined
  // Prazo desta tarefa (vínculo por id) ou, se não houver, o próximo prazo aberto do processo.
  const ownPrazo = can("processes.view") ? taskPrazo(task, data.deadlines) : undefined
  const shownPrazo = ownPrazo ?? (process && process.status !== "concluido" ? nextPrazo(data.deadlines, process.id) : undefined)

  return (
    <section className="space-y-3">
      <Eyebrow>Contexto</Eyebrow>
      {process && (
        <Link
          href={`/processos/${process.id}`}
          className="group block rounded-[12px] border border-border bg-surface p-3.5 outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[13.5px] font-medium">
              {processTitle(process, client?.name)} <span className="tabular font-normal text-subtle">· {processNumberLabel(process)}</span>
            </p>
            <StatusBadge tone={PROCESS_STATUS[process.status].tone} size="sm">
              {PROCESS_STATUS[process.status].label}
            </StatusBadge>
          </div>
          <dl className="mt-2 space-y-1 text-[12.5px] text-muted-foreground">
            {shownPrazo && (
              <div className="flex gap-1.5">
                <dt>{ownPrazo ? "Prazo desta tarefa:" : "Próximo prazo:"}</dt>
                <dd className="min-w-0 truncate text-foreground">
                  {shownPrazo.status === "aberto" ? fmtDueIn(shownPrazo.fatalDate) : PRAZO_STATUS[shownPrazo.status].label.toLowerCase()} · fatal em{" "}
                  {fmtNumericDate(shownPrazo.fatalDate)} · {shownPrazo.description}
                </dd>
              </div>
            )}
            {lastMovement && (
              <div className="flex gap-1.5">
                <dt>Última movimentação:</dt>
                <dd className="min-w-0 truncate text-foreground">
                  {fmtRelative(lastMovement)} · {process.movements[0]?.title}
                </dd>
              </div>
            )}
          </dl>
        </Link>
      )}
      {client && (
        <Link
          href={`/clientes/${client.id}`}
          className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar name={client.name} size="xs" />
            <span className="truncate font-medium">{client.name}</span>
          </span>
          <StatusBadge tone={CLIENT_STATUS[client.status].tone} size="sm">
            {CLIENT_STATUS[client.status].label}
          </StatusBadge>
        </Link>
      )}
      <div className="rounded-[12px] border border-brand/20 bg-brand-soft/35 p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-brand-strong">
          <Sparkles className="size-3.5" /> Pergunte à Íntegra sobre esta tarefa
        </p>
        <div className="mt-2 flex flex-col gap-1">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                onBeforeAsk()
                lexa.ask(prompt, aiContext)
              }}
              className="touch-target relative rounded-[8px] px-2 py-1.5 text-left text-[12.5px] text-foreground outline-none transition-colors hover:bg-surface/80 focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

const field =
  "h-8 w-full min-w-0 cursor-pointer appearance-none truncate rounded-[7px] border border-transparent bg-transparent px-2 text-[13px] text-foreground outline-none transition-colors hover:border-border hover:bg-surface focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-9 grid-cols-[112px_minmax(0,1fr)] items-center gap-2">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

const encode = (r?: RelatedEntity) => (r ? `${r.type}:${r.id}` : "")
const decode = (v: string): RelatedEntity | undefined => {
  if (!v) return undefined
  const [type, id] = v.split(":")
  return { type: type as RelatedEntity["type"], id }
}

/**
 * Detalhes da tarefa no padrão Linear: título e propriedades editáveis ali mesmo,
 * descrição, checklist, contexto jurídico e o histórico real. Cada alteração grava
 * sobre a versão que está na tela (se alguém mudou antes, é recusada e a tela atualiza).
 */
export function TaskDetailSheet({
  task,
  related,
  open,
  onOpenChange,
  onToggle,
  onEdit,
  onDelete,
}: {
  task?: Task
  related?: { label: string; kind: string; href: string }
  open: boolean
  onOpenChange: (o: boolean) => void
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}) {
  const data = useOfficeData()
  const { updateTask, moveTask, confirmSaved, versionOf } = useOfficeActions()
  const { can } = useSession()
  const editable = can("tasks.edit")
  const [shown, setShown] = React.useState(task)
  const [deleting, setDeleting] = React.useState(false)
  if (task && task !== shown) setShown(task)
  const t = task ?? shown
  if (!t) return null

  const done = t.status === "concluida"
  const columns = [...data.taskColumns].sort((a, b) => a.order - b.order)
  const column = columnOfTask(t, columns)
  const prazo = taskPrazo(t, data.deadlines)
  const creator = t.createdById ? getUser(t.createdById) : undefined
  const members = getMembers()
  const activity = data.activities
    .filter((x) => x.taskId === t.id)
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, 12)

  const save = async (patch: Partial<Task>, message?: string) => {
    const result = await updateTask(t.id, patch, { baseVersion: versionOf("tasks", t.id) })
    if (result.status === "saved" && message) toast.success(message)
    return result.status === "saved"
  }
  const setColumn = async (columnId: string) => {
    if (columnId === column?.id) return
    const moved = moveTask(t.id, columnId)
    if (moved && (await confirmSaved("tasks", t.id))) toast.success(`Movida para ${columns.find((c) => c.id === columnId)?.name}.`)
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tarefas?tarefa=${t.id}`)
      toast.success("Link da tarefa copiado.", { description: "Abre para quem tem acesso às tarefas do escritório." })
    } catch {
      toast.error("Não foi possível copiar o link.")
    }
  }

  return (
    <SideSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Tarefa: ${t.title}`}
      className="sm:w-[580px]"
      header={
        <div className="flex items-center gap-2 border-b border-border py-2.5 pr-14 pl-5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: column?.color }} aria-hidden />
          <span className="text-[12.5px] font-medium text-muted-foreground">{column?.name ?? (done ? "Concluída" : "Pendente")}</span>
          {!done && dueGroup(t, new Date()) === "atrasadas" && (
            <StatusBadge tone="danger" size="sm">
              Atrasada
            </StatusBadge>
          )}
          <span className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Mais ações da tarefa"
              className="flex size-8 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem className="h-8 gap-2.5 px-2 text-[13px]" onClick={() => void copyLink()}>
                  <Link2 /> Copiar link da tarefa
                </DropdownMenuItem>
                {editable && (
                  <DropdownMenuItem className="h-8 gap-2.5 px-2 text-[13px]" onClick={() => onEdit(t)}>
                    <Pencil /> Editar no formulário
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              {editable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="h-8 gap-2.5 px-2 text-[13px]" variant="destructive" onClick={() => setDeleting(true)}>
                    <Trash2 /> Excluir tarefa
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
      footer={
        editable && (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[11.5px] text-subtle">As alterações são salvas na hora.</p>
            <Button variant={done ? "secondary" : "default"} onClick={() => onToggle(t)}>
              {done ? <RotateCcw /> : <Check />}
              {done ? "Reabrir" : "Concluir"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-6 px-5 pt-4 pb-6">
        <TitleField key={`${t.id}:${t.title}`} task={t} editable={editable} onSave={(title) => save({ title })} />

        <dl className="space-y-0.5">
          <Prop label="Status">
            <select
              aria-label="Status"
              value={column?.id ?? ""}
              disabled={!editable || !columns.length}
              onChange={(e) => void setColumn(e.target.value)}
              className={field}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isDone ? " (conclui)" : ""}
                </option>
              ))}
            </select>
          </Prop>
          <Prop label="Prioridade">
            <span className="flex items-center gap-1">
              <span className={cn("size-2 shrink-0 rounded-full bg-current", PRIORITY_STYLE[t.priority])} aria-hidden />
              <select
                aria-label="Prioridade"
                value={t.priority}
                disabled={!editable}
                onChange={(e) => void save({ priority: e.target.value as Priority }, "Prioridade alterada.")}
                className={field}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>
            </span>
          </Prop>
          <Prop label="Responsável">
            <span className="flex items-center gap-1.5">
              <UserAvatar name={getUser(t.assigneeId).name} src={getUser(t.assigneeId).avatarUrl} size="xs" />
              <select
                aria-label="Responsável"
                value={t.assigneeId}
                disabled={!editable}
                onChange={(e) => void save({ assigneeId: e.target.value }, `Passada para ${getUser(e.target.value).firstName}.`)}
                className={field}
              >
                {!members.some((m) => m.id === t.assigneeId) && <option value={t.assigneeId}>{getUser(t.assigneeId).name}</option>}
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </span>
          </Prop>
          <Prop label="Prazo">
            <span className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                aria-label="Data do prazo"
                value={t.dueAt.slice(0, 10)}
                disabled={!editable}
                onChange={(e) => e.target.value && void save({ dueAt: `${e.target.value}${t.dueAt.slice(10)}` }, "Prazo alterado.")}
                className={cn(field, "w-auto")}
              />
              <input
                type="time"
                aria-label="Horário do prazo"
                value={t.dueAt.slice(11, 16)}
                disabled={!editable}
                onChange={(e) => e.target.value && void save({ dueAt: `${t.dueAt.slice(0, 10)}T${e.target.value}:00` }, "Horário alterado.")}
                className={cn(field, "w-auto")}
              />
              {!done && <span className="text-[12px] text-muted-foreground">{fmtDueIn(t.dueAt)}</span>}
            </span>
          </Prop>
          <Prop label="Vínculo">
            <RelatedField task={t} editable={editable} onSave={(r) => save({ related: r }, r ? "Vínculo atualizado." : "Vínculo removido.")} />
          </Prop>
          {related && (
            <Prop label="">
              <Link href={related.href} className="inline-flex items-center gap-1 px-2 text-[12.5px] text-brand-strong hover:underline">
                Abrir {related.kind === "Cliente" ? "cliente" : "processo"} <ArrowUpRight className="size-3.5" />
              </Link>
            </Prop>
          )}
          <Prop label="Tipo">
            <span className="px-2 text-[13px] text-foreground">
              {prazo
                ? `Prazo processual (fatal em ${fmtNumericDate(prazo.fatalDate)})`
                : t.related?.type === "process"
                  ? "Processo"
                  : t.related?.type === "client"
                    ? "Cliente"
                    : "Interna"}
            </span>
          </Prop>
          <Prop label="Criada">
            <span className="px-2 text-[12.5px] text-muted-foreground">
              {fmtActivityTime(t.createdAt)}
              {creator ? ` por ${creator.name}` : ""}
            </span>
          </Prop>
          {done && t.completedAt && (
            <Prop label="Concluída">
              <span className="px-2 text-[12.5px] text-muted-foreground">{fmtActivityTime(t.completedAt)}</span>
            </Prop>
          )}
        </dl>

        <DescriptionField
          key={`${t.id}:${t.description ?? ""}`}
          task={t}
          editable={editable}
          onSave={(description) => save({ description }, "Descrição salva.")}
        />
        <Checklist task={t} editable={editable} onSave={(checklist) => save({ checklist })} />
        <TaskPages task={t} />
        <TaskContext task={t} onBeforeAsk={() => onOpenChange(false)} />

        <section aria-label="Atividade">
          <Eyebrow className="mb-2">Atividade</Eyebrow>
          {activity.length ? (
            <ol className="relative space-y-3 border-l border-border pl-4">
              {activity.map((x) => (
                <li key={x.id} className="relative text-[12.5px] leading-snug">
                  <span className="absolute top-1.5 -left-[20.5px] size-2 rounded-full bg-border-strong ring-4 ring-popover" aria-hidden />
                  <p className="text-foreground">
                    <span className="font-medium">{x.actor}</span> {x.message}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground" title={new Date(x.at).toLocaleString("pt-BR")}>
                    {fmtRelative(x.at)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Criação, conclusões, mudanças de coluna e de responsável feitas a partir de agora aparecem aqui.
            </p>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir "${t.title}"?`}
        description="A tarefa sai do quadro, da lista e do perfil do cliente e do processo. Não dá para desfazer."
        confirmLabel="Excluir tarefa"
        onConfirm={() => onDelete(t)}
      />
    </SideSheet>
  )
}

function TitleField({ task, editable, onSave }: { task: Task; editable: boolean; onSave: (title: string) => Promise<boolean> }) {
  const [value, setValue] = React.useState(task.title)
  const [error, setError] = React.useState("")
  const commit = async () => {
    const trimmed = value.trim().replace(/\s+/g, " ")
    if (trimmed === task.title) return
    if (trimmed.length < 3) {
      setError("O título precisa de ao menos 3 letras.")
      setValue(task.title)
      return
    }
    setError("")
    if (!(await onSave(trimmed))) setValue(task.title)
  }
  return (
    <div>
      <textarea
        aria-label="Título da tarefa"
        rows={1}
        value={value}
        readOnly={!editable}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            e.currentTarget.blur()
          }
          if (e.key === "Escape") {
            setValue(task.title)
            e.currentTarget.blur()
          }
        }}
        className={cn(
          "field-sizing-content w-full resize-none rounded-[8px] border border-transparent bg-transparent px-2 py-1 -mx-2 text-[19px] leading-snug font-semibold tracking-[-0.015em] break-words text-foreground outline-none",
          editable && "hover:border-border focus:border-brand/60 focus:ring-2 focus:ring-brand/15",
          task.status === "concluida" && "text-muted-foreground",
        )}
      />
      {error && (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function DescriptionField({ task, editable, onSave }: { task: Task; editable: boolean; onSave: (d: string | undefined) => Promise<boolean> }) {
  const [value, setValue] = React.useState(task.description ?? "")
  const dirty = value.trim() !== (task.description ?? "").trim()
  const commit = async () => {
    if (!dirty) return
    if (!(await onSave(value.trim() || undefined))) setValue(task.description ?? "")
  }
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <Eyebrow>Descrição</Eyebrow>
        {dirty && <span className="text-[11.5px] text-subtle">Salva ao sair do campo</span>}
      </div>
      {editable ? (
        <textarea
          aria-label="Descrição da tarefa"
          value={value}
          maxLength={5000}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit()}
          placeholder="Instruções de trabalho, documentos a conferir, observações para a equipe…"
          className="field-sizing-content min-h-[84px] w-full resize-none rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-subtle hover:border-border-strong focus:border-brand/60 focus:ring-2 focus:ring-brand/15"
        />
      ) : (
        <p className="rounded-[10px] bg-surface-muted/60 px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-line text-foreground/90">
          {task.description || "Sem descrição."}
        </p>
      )}
    </section>
  )
}

function RelatedField({ task, editable, onSave }: { task: Task; editable: boolean; onSave: (r?: RelatedEntity) => Promise<boolean> }) {
  const data = useOfficeData()
  const value = encode(task.related)
  return (
    <select
      aria-label="Vínculo com cliente ou processo"
      value={value}
      disabled={!editable}
      onChange={(e) => void onSave(decode(e.target.value))}
      className={field}
    >
      <option value="">Sem vínculo (tarefa interna)</option>
      <optgroup label="Processos">
        {data.processes
          .filter((p) => p.status !== "concluido" || encode({ type: "process", id: p.id }) === value)
          .map((p) => (
            <option key={p.id} value={`process:${p.id}`}>
              {processTitle(p, byId(data.clients, p.clientId)?.name)} · {processNumberLabel(p)}
            </option>
          ))}
      </optgroup>
      <optgroup label="Clientes">
        {data.clients
          .filter((c) => c.status !== "inativo" || encode({ type: "client", id: c.id }) === value)
          .map((c) => (
            <option key={c.id} value={`client:${c.id}`}>
              {c.name}
            </option>
          ))}
      </optgroup>
    </select>
  )
}

function Checklist({ task, editable, onSave }: { task: Task; editable: boolean; onSave: (items: Task["checklist"]) => Promise<boolean> }) {
  const items = task.checklist ?? []
  const progress = checklistProgress(task)
  const [text, setText] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const write = async (next: NonNullable<Task["checklist"]>) => {
    setSaving(true)
    const ok = await onSave(next.length ? next : undefined)
    setSaving(false)
    return ok
  }
  const add = async () => {
    const trimmed = text.trim()
    if (!trimmed || saving) return
    if (await write([...items, { id: uid("ck"), text: trimmed, done: false }])) setText("")
  }
  if (!editable && !items.length) return null
  return (
    <section aria-label="Checklist">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Eyebrow className="flex items-center gap-1.5">
          <ListChecks className="size-3.5" /> Checklist
        </Eyebrow>
        {progress.total > 0 && (
          <span className="tabular text-[11.5px] text-muted-foreground">
            {progress.done} de {progress.total}
          </span>
        )}
      </div>
      {progress.total > 0 && (
        <div
          className="mb-2 h-1 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label="Progresso do checklist"
        >
          <div
            className="h-full rounded-full bg-success transition-[width] duration-200"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 rounded-[8px] px-1 py-1 hover:bg-accent/50">
            <input
              type="checkbox"
              checked={item.done}
              disabled={!editable || saving}
              aria-label={item.done ? `Desmarcar: ${item.text}` : `Marcar: ${item.text}`}
              onChange={() => void write(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              className="size-4 shrink-0 cursor-pointer accent-[var(--success)]"
            />
            <span className={cn("min-w-0 flex-1 text-[13px] break-words", item.done ? "text-subtle line-through" : "text-foreground")}>
              {item.text}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => void write(items.filter((i) => i.id !== item.id))}
                aria-label={`Remover item: ${item.text}`}
                className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-subtle opacity-0 outline-none group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/40 [@media(hover:none)]:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="mt-1 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Plus className="ml-1 size-4 shrink-0 text-subtle" aria-hidden />
          <input
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder="Adicionar item (Enter)"
            aria-label="Novo item do checklist"
            className="h-8 min-w-0 flex-1 rounded-[7px] border border-transparent bg-transparent px-1 text-[13px] outline-none placeholder:text-subtle hover:border-border focus:border-brand/60"
          />
        </form>
      )}
    </section>
  )
}
