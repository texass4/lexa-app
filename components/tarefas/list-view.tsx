"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowDown, ArrowUp, Check, CheckCheck, Columns3, Flag, Trash2, UserRound, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LimitedList, type MoreFromServer } from "@/components/ui/show-more"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { describeRelated } from "@/lib/store/selectors"
import { createLocalStore } from "@/lib/core/hooks"
import { PRIORITY_CONFIG } from "@/lib/core/config"
import { fmtRelative } from "@/lib/core/dates"
import { getMembers, getUser } from "@/lib/auth/account"
import { checklistProgress, PRIORITIES, sortTasks, type SortDir, type SortKey } from "@/lib/tarefas/workspace"
import type { Priority, Task, TaskColumn } from "@/types"
import { DueChip, PRIORITY_STYLE } from "./task-card"
import { useTaskActions } from "./task-actions"

type ColKey = "status" | "prioridade" | "responsavel" | "prazo" | "vinculo" | "atualizada"

const COLS: { key: ColKey; label: string; sort?: SortKey; width: string; min: string }[] = [
  { key: "status", label: "Status", sort: "status", width: "w-[150px]", min: "@3xl/tasks:table-cell" },
  { key: "prioridade", label: "Prioridade", sort: "prioridade", width: "w-[112px]", min: "@4xl/tasks:table-cell" },
  { key: "responsavel", label: "Responsável", sort: "responsavel", width: "w-[160px]", min: "@4xl/tasks:table-cell" },
  { key: "prazo", label: "Prazo", sort: "prazo", width: "w-[132px]", min: "@xl/tasks:table-cell" },
  { key: "vinculo", label: "Cliente / processo", width: "w-[22%]", min: "@5xl/tasks:table-cell" },
  { key: "atualizada", label: "Atualizada", width: "w-[110px]", min: "@6xl/tasks:table-cell" },
]

/** Colunas escondidas pela pessoa (preferência do navegador). */
const hiddenStore = createLocalStore("lexa:tarefas:lista-ocultas", "atualizada")

const inlineSelect =
  "h-7 w-full min-w-0 cursor-pointer appearance-none truncate rounded-[6px] border border-transparent bg-transparent px-1.5 text-[12.5px] text-foreground outline-none transition-colors hover:border-border hover:bg-surface focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"

export function ListView({
  tasks,
  columns,
  columnOf,
  history,
  listKey,
  activeId,
  selected,
  onSelected,
  onOpen,
  sort,
  onSort,
}: {
  tasks: Task[]
  columns: TaskColumn[]
  columnOf: (t: Task) => TaskColumn | undefined
  history?: MoreFromServer
  listKey: string
  activeId?: string
  selected: ReadonlySet<string>
  onSelected: (next: ReadonlySet<string>) => void
  onOpen: (id: string) => void
  sort: { key: SortKey; dir: SortDir }
  onSort: (s: { key: SortKey; dir: SortDir }) => void
}) {
  const hiddenRaw = React.useSyncExternalStore(hiddenStore.subscribe, hiddenStore.get, hiddenStore.getServer)
  const hidden = React.useMemo(() => new Set(hiddenRaw.split(",").filter(Boolean)), [hiddenRaw])
  const cols = COLS.filter((c) => !hidden.has(c.key))
  const rows = React.useMemo(() => sortTasks(tasks, sort.key, sort.dir, { columns, assigneeName: (id) => getUser(id).name }), [tasks, sort, columns])
  const { editable } = useTaskActions()
  const lastIndex = React.useRef<number | null>(null)
  const tableRef = React.useRef<HTMLTableElement>(null)

  const toggle = (id: string, index: number, shift: boolean) => {
    const next = new Set(selected)
    if (shift && lastIndex.current !== null) {
      const [a, b] = [Math.min(lastIndex.current, index), Math.max(lastIndex.current, index)]
      for (const t of rows.slice(a, b + 1)) next.add(t.id)
    } else if (next.has(id)) next.delete(id)
    else next.add(id)
    lastIndex.current = index
    onSelected(next)
  }
  const sortBy = (key: SortKey) => onSort({ key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" })

  // Teclado (padrão Linear): ↑/↓ ou J/K percorrem as linhas; Enter abre; X seleciona.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const target = e.target as HTMLElement
    if (target.closest("input,select,textarea,[role=menu]")) return
    const rowEls = [...(tableRef.current?.querySelectorAll<HTMLElement>("tbody tr[data-row]") ?? [])]
    const current = rowEls.findIndex((r) => r.contains(target))
    if (["ArrowDown", "j", "ArrowUp", "k"].includes(e.key)) {
      e.preventDefault()
      const delta = e.key === "ArrowDown" || e.key === "j" ? 1 : -1
      rowEls[Math.max(0, Math.min(rowEls.length - 1, current + delta))]?.focus()
    } else if (e.key === "x" && editable && current >= 0) {
      e.preventDefault()
      toggle(rows[current].id, current, e.shiftKey)
    }
  }

  const all = rows.length > 0 && rows.every((t) => selected.has(t.id))
  const some = !all && rows.some((t) => selected.has(t.id))
  const headerRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = some
  }, [some])

  return (
    <div className="@container/tasks space-y-2">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
            <Columns3 /> Propriedades
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
              {COLS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hidden.has(c.key)}
                  onCheckedChange={(on) => {
                    const next = new Set(hidden)
                    if (on) next.delete(c.key)
                    else next.add(c.key)
                    hiddenStore.set([...next].join(","))
                  }}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <LimitedList items={rows} listKey={listKey} server={history}>
        {(visible) => (
          <div className="overflow-hidden rounded-card border border-border bg-card">
            <table ref={tableRef} onKeyDown={onKeyDown} className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
              <thead className="@max-xl/tasks:hidden">
                <tr className="bg-surface-muted/60 text-[12px] text-muted-foreground [&>th]:border-b [&>th]:border-border">
                  {editable && (
                    <th scope="col" className="w-11 py-2 pr-0 pl-4">
                      <label className="touch-target relative flex size-5 cursor-pointer items-center justify-center">
                        <input
                          ref={headerRef}
                          type="checkbox"
                          aria-label="Selecionar todas as tarefas exibidas"
                          checked={all}
                          disabled={!rows.length}
                          onChange={(e) => {
                            const next = new Set(selected)
                            for (const t of rows) {
                              if (e.target.checked) next.add(t.id)
                              else next.delete(t.id)
                            }
                            onSelected(next)
                          }}
                          className="size-4 cursor-pointer accent-[var(--brand)]"
                        />
                      </label>
                    </th>
                  )}
                  <HeaderCell label="Título" sortKey="titulo" sort={sort} onSort={sortBy} />
                  {cols.map((c) => (
                    <HeaderCell key={c.key} label={c.label} sortKey={c.sort} sort={sort} onSort={sortBy} className={cn("hidden", c.width, c.min)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((t, i) => (
                  <Row
                    key={t.id}
                    task={t}
                    index={i}
                    cols={cols}
                    columns={columns}
                    column={columnOf(t)}
                    checked={selected.has(t.id)}
                    active={activeId === t.id}
                    onToggle={toggle}
                    onOpen={onOpen}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LimitedList>
    </div>
  )
}

function HeaderCell({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey?: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sortKey && sort.key === sortKey
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      className={cn("px-2 py-2 text-left font-medium", className)}
    >
      {sortKey ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            "inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40",
            active && "text-foreground",
          )}
        >
          {label}
          {active && <Arrow className="size-3" aria-hidden />}
        </button>
      ) : (
        <span className="px-1">{label}</span>
      )}
    </th>
  )
}

function Row({
  task: t,
  index,
  cols,
  columns,
  column,
  checked,
  active,
  onToggle,
  onOpen,
}: {
  task: Task
  index: number
  cols: typeof COLS
  columns: TaskColumn[]
  column?: TaskColumn
  checked: boolean
  active: boolean
  onToggle: (id: string, index: number, shift: boolean) => void
  onOpen: (id: string) => void
}) {
  const data = useOfficeData()
  const { versionOf } = useOfficeActions()
  const a = useTaskActions()
  const related = describeRelated(data, t.related)
  const done = t.status === "concluida"
  const progress = checklistProgress(t)
  const version = versionOf("tasks", t.id)
  const cell = "border-b border-border/70 px-2 py-1.5"

  const cellOf = (key: ColKey) => {
    switch (key) {
      case "status":
        return (
          <span className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: column?.color }} aria-hidden />
            <select
              aria-label={`Status de ${t.title}`}
              value={column?.id ?? ""}
              disabled={!a.editable}
              onChange={(e) => void a.move(t, e.target.value)}
              className={inlineSelect}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </span>
        )
      case "prioridade":
        return (
          <span className="flex items-center gap-1">
            <Flag className={cn("size-3.5 shrink-0", PRIORITY_STYLE[t.priority])} aria-hidden />
            <select
              aria-label={`Prioridade de ${t.title}`}
              value={t.priority}
              disabled={!a.editable}
              onChange={(e) =>
                void a.update(
                  t,
                  { priority: e.target.value as Priority },
                  `Prioridade ${PRIORITY_CONFIG[e.target.value as Priority].label.toLowerCase()}.`,
                )
              }
              className={inlineSelect}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_CONFIG[p].label}
                </option>
              ))}
            </select>
          </span>
        )
      case "responsavel": {
        const user = getUser(t.assigneeId)
        const members = getMembers()
        return (
          <span className="flex items-center gap-1.5">
            <UserAvatar name={user.name} src={user.avatarUrl} size="xs" />
            <select
              aria-label={`Responsável por ${t.title}`}
              value={t.assigneeId}
              disabled={!a.editable}
              onChange={(e) => void a.update(t, { assigneeId: e.target.value }, `Passada para ${getUser(e.target.value).firstName}.`)}
              className={inlineSelect}
            >
              {!members.some((m) => m.id === t.assigneeId) && <option value={t.assigneeId}>{user.name}</option>}
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </span>
        )
      }
      case "prazo":
        return a.editable && !done ? (
          <span className="flex items-center gap-1">
            <DueChip task={t} />
            <input
              type="date"
              aria-label={`Prazo de ${t.title}`}
              value={t.dueAt.slice(0, 10)}
              onChange={(e) => e.target.value && void a.update(t, { dueAt: `${e.target.value}${t.dueAt.slice(10)}` }, "Prazo alterado.")}
              className="h-7 w-7 shrink-0 cursor-pointer rounded-[6px] border border-transparent bg-transparent text-transparent outline-none hover:border-border focus-visible:border-brand/60 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
              title="Alterar prazo"
            />
          </span>
        ) : (
          <DueChip task={t} />
        )
      case "vinculo":
        return related ? (
          <Link
            href={related.href}
            className="block truncate text-[12.5px] text-muted-foreground hover:text-foreground hover:underline"
            title={`${related.label} · ${related.kind}`}
          >
            {related.label}
          </Link>
        ) : (
          <span className="text-[12px] text-subtle">Interna</span>
        )
      case "atualizada":
        return <span className="text-[12px] text-muted-foreground">{version ? fmtRelative(new Date(version).toISOString()) : "—"}</span>
    }
  }

  return (
    <tr
      data-row
      tabIndex={0}
      aria-label={t.title}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen(t.id)
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select,label")) return
        if (e.shiftKey && a.editable) return onToggle(t.id, index, true)
        onOpen(t.id)
      }}
      className={cn(
        "group cursor-default outline-none transition-colors duration-150 focus-visible:bg-accent/70",
        active ? "bg-brand-soft/60" : checked ? "bg-brand-soft/35" : "hover:bg-accent/45",
      )}
    >
      {a.editable && (
        <td className={cn(cell, "w-11 pr-0 pl-4")}>
          <label className="touch-target relative flex size-5 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Selecionar ${t.title}`}
              checked={checked}
              onChange={() => undefined}
              onClick={(e) => onToggle(t.id, index, e.shiftKey)}
              className="size-4 cursor-pointer accent-[var(--brand)]"
            />
          </label>
        </td>
      )}
      <td className={cn(cell, "py-2")}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            disabled={!a.editable}
            onClick={() => void a.setDone(t, !done)}
            aria-label={done ? `Reabrir: ${t.title}` : `Concluir: ${t.title}`}
            className={cn(
              "touch-target relative flex size-[15px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 disabled:cursor-default",
              done ? "border-success bg-success text-white" : "border-border-strong hover:border-success hover:bg-success-soft",
            )}
          >
            {done && <Check className="size-2.5" strokeWidth={3} />}
          </button>
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            title={t.title}
            className={cn(
              "min-w-0 truncate text-left font-medium outline-none hover:underline focus-visible:underline",
              done ? "text-subtle line-through decoration-subtle/60" : "text-foreground",
            )}
          >
            {t.title}
          </button>
          {progress.total > 0 && (
            <span className={cn("tabular shrink-0 text-[11px]", progress.done === progress.total ? "text-success" : "text-subtle")} title="Checklist">
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
        {/* Telas estreitas: o que as colunas escondidas diriam. */}
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-[23px] text-[11.5px] text-muted-foreground @3xl/tasks:hidden">
          <span className="shrink-0 whitespace-nowrap">{column?.name}</span>
          <span className="@xl/tasks:hidden">· </span>
          <span className="shrink-0 whitespace-nowrap @xl/tasks:hidden">
            <DueChip task={t} className="h-auto bg-transparent px-0" />
          </span>
          {related && <span className="truncate">· {related.label}</span>}
        </p>
      </td>
      {cols.map((c) => (
        <td key={c.key} className={cn(cell, "hidden", c.min)}>
          {cellOf(c.key)}
        </td>
      ))}
    </tr>
  )
}

/** Barra da seleção (lista): só operações que o banco grava, conforme a permissão. */
export function BulkBar({ tasks, columns, onClear }: { tasks: Task[]; columns: TaskColumn[]; onClear: () => void }) {
  const a = useTaskActions()
  const reduce = useReducedMotion()
  const members = getMembers()
  const item = "h-8 gap-2.5 px-2 text-[13px]"
  return (
    <AnimatePresence>
      {tasks.length > 0 && (
        <motion.div
          role="region"
          aria-label="Ações para as tarefas selecionadas"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="sticky bottom-[calc(env(safe-area-inset-bottom)+84px)] z-30 mx-auto mt-3 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-[14px] border border-border bg-popover p-1.5 shadow-float no-scrollbar md:bottom-5"
        >
          <span className="px-2.5 text-[13px] font-semibold whitespace-nowrap" aria-live="polite">
            {tasks.length} selecionada{tasks.length === 1 ? "" : "s"}
          </span>
          {a.editable && (
            <>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                  <Columns3 /> Status
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-52">
                  {columns.map((c) => (
                    <DropdownMenuItem key={c.id} className={item} onClick={() => void a.bulkColumn(tasks, c.id)}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden /> {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                  <UserRound /> <span className="max-sm:sr-only">Responsável</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 w-56">
                  {members.map((m) => (
                    <DropdownMenuItem key={m.id} className={item} onClick={() => void a.bulkAssignee(tasks, m.id)}>
                      <UserAvatar name={m.name} src={m.avatarUrl} size="xs" /> {m.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                  <Flag /> <span className="max-sm:sr-only">Prioridade</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-44">
                  {PRIORITIES.map((p) => (
                    <DropdownMenuItem key={p} className={item} onClick={() => void a.bulkPriority(tasks, p)}>
                      <Flag className={PRIORITY_STYLE[p]} /> {PRIORITY_CONFIG[p].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {tasks.some((t) => t.status !== "concluida") && (
                <Button variant="ghost" size="sm" onClick={() => void a.bulkDone(tasks)}>
                  <CheckCheck /> <span className="max-sm:sr-only">Concluir</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => a.remove(tasks, onClear)}
              >
                <Trash2 /> <span className="max-sm:sr-only">Excluir</span>
              </Button>
            </>
          )}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
          <Button variant="ghost" size="icon-sm" aria-label="Limpar seleção" title="Limpar seleção (Esc)" onClick={onClear}>
            <X />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
