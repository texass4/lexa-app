"use client"

import { FilePlus2, ListPlus, Loader2, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { createPageAction } from "@/app/actions/pages"
import { createTaskAction } from "@/app/actions/tasks"
import { REF_ICON } from "@/components/shell/ref-icons"
import { Dialog } from "@/components/ui/dialog"
import { cn } from "@/lib/cn"
import { BOARD_LINKABLE, REF_LABEL, type Ref, type RefType } from "@/lib/domain/refs"
import type { SearchResult } from "@/lib/services/search"

type Picked = Ref & { title: string }

/** Escolhe um registro existente (ou cria uma tarefa/página) para vincular ao quadro. */
export function RecordPicker({ open, onOpenChange, onPick, title = "Vincular registro" }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (r: Picked) => void; title?: string }) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState<RefType | "all">("all")
  const [results, setResults] = useState<SearchResult[]>([])
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const [active, setActive] = useState(0)
  const [creating, setCreating] = useState(false)
  const req = useRef(0)

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    const id = ++req.current
    if (!q) {
      setResults([]) // eslint-disable-line react-hooks/set-state-in-effect -- limpa a lista quando a busca fica vazia
      setState("idle")
      return
    }
    setState("loading")
    const t = setTimeout(async () => {
      try {
        const types = type === "all" ? BOARD_LINKABLE : [type]
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&types=${types.join(",")}&limit=6`)
        if (!res.ok) throw new Error()
        const data = (await res.json()) as { results: SearchResult[] }
        if (id === req.current) {
          setResults(data.results)
          setActive(0)
          setState("idle")
        }
      } catch {
        if (id === req.current) setState("error")
      }
    }, 150)
    return () => clearTimeout(t)
  }, [query, type, open])

  const create = async (kind: "task" | "page") => {
    const q = query.trim()
    if (!q || creating) return
    setCreating(true)
    const result = kind === "task" ? await createTaskAction({ title: q }) : await createPageAction({ title: q })
    setCreating(false)
    if (!result.ok) return void toast.error(result.error)
    onPick({ type: kind, id: result.data.id, title: q })
    toast.success(kind === "task" ? "Tarefa criada e vinculada ao quadro." : "Página criada e vinculada ao quadro.")
  }

  const options = [
    ...results.map((r) => ({ key: `${r.type}:${r.id}`, run: () => onPick({ type: r.type, id: r.id, title: r.title }), result: r })),
    ...(query.trim() && state === "idle"
      ? [
          { key: "create-task", run: () => void create("task"), result: null as SearchResult | null, label: `Criar tarefa “${query.trim()}”`, icon: ListPlus },
          { key: "create-page", run: () => void create("page"), result: null as SearchResult | null, label: `Criar página “${query.trim()}”`, icon: FilePlus2 },
        ]
      : []),
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setQuery("")
      }}
      title={title}
      description="O elemento mostra sempre o estado atual do registro — nada é copiado."
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(options.length - 1, a + 1)))
              if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)))
              if (e.key === "Enter") (e.preventDefault(), options[active]?.run())
            }}
            placeholder="Buscar tarefa, projeto, página ou entrada do diário…"
            aria-label="Buscar registro"
            className="field h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tipo">
          {(["all", ...BOARD_LINKABLE] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn("h-7 rounded-sm px-2.5 text-xs", type === t ? "bg-ink text-paper" : "border border-line text-ink-3 hover:text-ink")}
            >
              {t === "all" ? "Todos" : REF_LABEL[t]}
            </button>
          ))}
        </div>
        <ul className="max-h-72 overflow-y-auto" role="listbox" aria-label="Resultados">
          {state === "loading" ? (
            <li className="flex items-center gap-2 px-3 py-3 text-sm text-ink-4">
              <Loader2 className="size-4 animate-spin" /> Buscando…
            </li>
          ) : null}
          {state === "error" ? <li className="px-3 py-3 text-sm text-clay">Não foi possível buscar. Tente de novo.</li> : null}
          {!query.trim() ? <li className="px-3 py-3 text-sm text-ink-4">Digite para encontrar um registro, ou um nome para criar uma tarefa ou página nova.</li> : null}
          {options.map((o, i) => {
            const Icon = o.result ? REF_ICON[o.result.type] : "icon" in o ? o.icon! : ListPlus
            return (
              <li key={o.key}>
                <button
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={o.run}
                  disabled={creating}
                  className={cn("flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm", i === active ? "bg-cobalt-wash" : "")}
                >
                  <Icon className="size-4 shrink-0 text-ink-4" />
                  <span className="min-w-0 flex-1 truncate">{o.result ? o.result.title : "label" in o ? o.label : ""}</span>
                  {o.result ? <span className="meta shrink-0">{o.result.meta ?? REF_LABEL[o.result.type]}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}
