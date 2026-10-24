"use client"

import { Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { useShell } from "@/components/shell/shell-context"
import { cn } from "@/lib/cn"
import { PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain/tasks"
import { hasActiveFilters, taskHref, type TaskSearchParams } from "@/lib/task-views"

/** Barra de filtros: status, prioridade, prazo, projeto, área, tag e texto. Fica na URL. */
export function TaskFilters({ params, tags, showStatus = true, showDue = true }: { params: TaskSearchParams; tags: string[]; showStatus?: boolean; showDue?: boolean }) {
  const router = useRouter()
  const { projects, areas } = useShell()
  const [pending, start] = useTransition()
  const [q, setQ] = useState(params.q)

  const go = (changes: Partial<TaskSearchParams>) => start(() => router.replace(taskHref(params, changes), { scroll: false }))

  // Busca por texto com uma pequena espera para não navegar a cada tecla.
  useEffect(() => {
    if (q === params.q) return
    const handle = setTimeout(() => go({ q }), 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const select = "field h-8 w-auto py-0 text-xs"
  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")} role="search" aria-label="Filtrar tarefas">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-4" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por texto" aria-label="Filtrar por texto" className="field h-8 w-44 py-0 pl-8 text-xs" />
      </div>
      {showStatus ? (
        <select aria-label="Status" value={params.status} onChange={(e) => go({ status: e.target.value as TaskSearchParams["status"] })} className={select}>
          <option value="open">Abertas</option>
          <option value="all">Todas</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      ) : null}
      <select aria-label="Prioridade" value={params.priority} onChange={(e) => go({ priority: e.target.value as TaskSearchParams["priority"] })} className={select}>
        <option value="">Qualquer prioridade</option>
        {TASK_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      {showDue ? (
        <select aria-label="Prazo" value={params.due} onChange={(e) => go({ due: e.target.value as TaskSearchParams["due"] })} className={select}>
          <option value="any">Qualquer prazo</option>
          <option value="week">Prazo nesta semana</option>
          <option value="none">Sem prazo</option>
          <option value="range">Intervalo de datas…</option>
        </select>
      ) : null}
      {showDue && params.due === "range" ? (
        <span className="flex items-center gap-1">
          <input type="date" aria-label="De" value={params.from} onChange={(e) => go({ from: e.target.value })} className={select} />
          <span className="text-xs text-ink-4">até</span>
          <input type="date" aria-label="Até" value={params.to} onChange={(e) => go({ to: e.target.value })} className={select} />
        </span>
      ) : null}
      <select aria-label="Projeto" value={params.project} onChange={(e) => go({ project: e.target.value })} className={select}>
        <option value="">Todos os projetos</option>
        <option value="none">Sem projeto</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <select aria-label="Área" value={params.area} onChange={(e) => go({ area: e.target.value })} className={select}>
        <option value="">Todas as áreas</option>
        <option value="none">Sem área</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      {tags.length ? (
        <select aria-label="Tag" value={params.tag} onChange={(e) => go({ tag: e.target.value })} className={select}>
          <option value="">Todas as tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
      ) : null}
      {hasActiveFilters(params) ? (
        <button
          onClick={() => {
            setQ("")
            go({ status: "open", priority: "", project: "", area: "", tag: "", due: "any", from: "", to: "", q: "" })
          }}
          className="inline-flex h-8 items-center gap-1 px-2 text-xs text-ink-3 hover:text-ink"
        >
          <X className="size-3.5" /> Limpar filtros
        </button>
      ) : null}
    </div>
  )
}
