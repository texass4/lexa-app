"use client"

import { Dialog } from "@base-ui/react/dialog"
import { Command } from "cmdk"
import { ArrowRight, BookOpen, CalendarRange, Compass, FileText, FolderKanban, Home, Inbox, ListChecks, Loader2, Plus, Settings, Waypoints, type LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { createBoardAction } from "@/app/actions/boards"
import { createPageAction } from "@/app/actions/pages"
import { captureAction } from "@/app/actions/inbox"
import { REF_LABEL, type RefType } from "@/lib/domain/refs"
import type { SearchResult } from "@/lib/services/search"
import { REF_ICON } from "./ref-icons"
import { useShell } from "./shell-context"

const GO: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Início", href: "/", icon: Home },
  { label: "Caixa de entrada", href: "/inbox", icon: Inbox },
  { label: "Tarefas", href: "/tasks", icon: ListChecks },
  { label: "Planejamento", href: "/planning", icon: CalendarRange },
  { label: "Diário de hoje", href: "/journal", icon: BookOpen },
  { label: "Páginas", href: "/pages", icon: FileText },
  { label: "Projetos", href: "/projects", icon: FolderKanban },
  { label: "Áreas", href: "/areas", icon: Compass },
  { label: "Quadros", href: "/canvas", icon: Waypoints },
  { label: "Configurações", href: "/settings", icon: Settings },
]

type SearchState = { status: "idle" | "loading" | "done" | "error"; results: SearchResult[]; query: string }

/** Busca global + comandos (Ctrl/⌘ K). Resultados vêm direto dos registros reais. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const shell = useShell()
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState<SearchState>({ status: "idle", results: [], query: "" })
  const requestId = useRef(0)
  const q = query.trim()

  // A consulta roda com uma pequena espera; o estado só muda quando a resposta chega.
  useEffect(() => {
    if (!q) return
    const id = ++requestId.current
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`)
        if (!res.ok) throw new Error()
        const data = (await res.json()) as { results: SearchResult[] }
        if (id === requestId.current) setSearch({ status: "done", results: data.results, query: q })
      } catch {
        if (id === requestId.current) setSearch({ status: "error", results: [], query: q })
      }
    }, 160)
    return () => clearTimeout(handle)
  }, [q])

  // Resultado de uma busca anterior não vale para o texto atual: mostra "buscando".
  const current: SearchState = !q ? { status: "idle", results: [], query: "" } : search.query === q ? search : { status: "loading", results: [], query: q }

  const changeOpen = (next: boolean) => {
    if (!next) {
      setQuery("")
      setSearch({ status: "idle", results: [], query: "" })
    }
    onOpenChange(next)
  }

  const grouped = useMemo(() => {
    const map = new Map<RefType, SearchResult[]>()
    for (const r of current.results) map.set(r.type, [...(map.get(r.type) ?? []), r])
    return [...map.entries()]
  }, [current.results])

  const close = () => changeOpen(false)
  const go = (href: string) => {
    close()
    router.push(href)
  }
  const matches = (label: string) => !q || label.toLowerCase().includes(q.toLowerCase())

  const createPage = async () => {
    close()
    const result = await createPageAction({ title: q })
    if (!result.ok) return toast.error(result.error)
    router.push(`/pages/${result.data.id}`)
  }
  const createBoard = async () => {
    close()
    const result = await createBoardAction({ title: q })
    if (!result.ok) return toast.error(result.error)
    router.push(`/canvas/${result.data.id}`)
  }
  const capture = async () => {
    close()
    const result = await captureAction(q)
    if (!result.ok) return toast.error(result.error)
    toast.success("Guardado na caixa de entrada.")
  }

  const itemClass =
    "flex cursor-default items-center gap-3 rounded-sm px-3 py-2 text-sm text-ink-2 outline-none select-none data-[selected=true]:bg-cobalt-wash data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-4"
  const groupClass = "[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1"

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/35 transition-opacity duration-100 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-[10vh] left-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-md border border-line bg-white shadow-float outline-none transition-[opacity,transform] duration-100 data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0">
          <Dialog.Title className="sr-only">Buscar e comandos</Dialog.Title>
          <Command shouldFilter={false} label="Buscar e comandos" loop>
            <div className="flex items-center gap-3 border-b border-line-soft px-4">
              {current.status === "loading" ? <Loader2 className="size-4 animate-spin text-ink-4" /> : <span className="font-mono text-xs text-cobalt">⌘</span>}
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Buscar tarefas, páginas, diário, quadros… ou digite um comando"
                className="h-13 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-ink-5"
              />
            </div>
            <Command.List className="max-h-[min(60vh,28rem)] overflow-y-auto p-1.5">
              {current.status === "error" ? <div className="px-3 py-6 text-center text-sm text-clay">Não foi possível buscar agora. Verifique a conexão e tente de novo.</div> : null}
              {current.status === "done" && current.results.length === 0 ? (
                <div className="px-3 py-5 text-center text-sm text-ink-3">
                  Nada encontrado para <span className="font-medium text-ink">“{current.query}”</span>.
                </div>
              ) : null}

              {grouped.map(([type, results]) => (
                <Command.Group key={type} heading={REF_LABEL[type] + (type === "journal" ? "" : "s")} className={groupClass}>
                  {results.map((r) => {
                    const Icon = REF_ICON[r.type]
                    return (
                      <Command.Item key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`} onSelect={() => go(r.href)} className={itemClass}>
                        <Icon />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{r.title}</div>
                          {r.snippet ? <div className="truncate text-xs text-ink-4">{r.snippet}</div> : null}
                        </div>
                        {r.meta ? <span className="meta shrink-0">{r.meta}</span> : null}
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ))}

              <Command.Group heading="Criar" className={groupClass}>
                <Command.Item value="new-task" onSelect={() => (close(), shell.openQuickTask({ title: q }))} className={itemClass}>
                  <Plus />
                  <span className="flex-1">{q ? `Nova tarefa “${q}”` : "Nova tarefa"}</span>
                  <span className="meta">N</span>
                </Command.Item>
                {q ? (
                  <Command.Item value="capture" onSelect={capture} className={itemClass}>
                    <Inbox />
                    <span className="flex-1">Guardar “{q}” na caixa de entrada</span>
                  </Command.Item>
                ) : (
                  <Command.Item value="capture" onSelect={() => (close(), shell.openCapture())} className={itemClass}>
                    <Inbox />
                    <span className="flex-1">Captura rápida</span>
                    <span className="meta">C</span>
                  </Command.Item>
                )}
                <Command.Item value="new-page" onSelect={createPage} className={itemClass}>
                  <FileText />
                  <span className="flex-1">{q ? `Nova página “${q}”` : "Nova página"}</span>
                </Command.Item>
                <Command.Item value="new-board" onSelect={createBoard} className={itemClass}>
                  <Waypoints />
                  <span className="flex-1">{q ? `Novo quadro “${q}”` : "Novo quadro visual"}</span>
                </Command.Item>
              </Command.Group>

              {GO.some((g) => matches(g.label)) ? (
                <Command.Group heading="Ir para" className={groupClass}>
                  {GO.filter((g) => matches(g.label)).map((g) => (
                    <Command.Item key={g.href} value={`go:${g.href}`} onSelect={() => go(g.href)} className={itemClass}>
                      <g.icon />
                      <span className="flex-1">{g.label}</span>
                      <ArrowRight className="opacity-0 [[data-selected=true]_&]:opacity-100" />
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line-soft px-4 py-2 text-ink-4">
              <span className="meta">↑↓ navegar</span>
              <span className="meta">↵ abrir</span>
              <span className="meta">esc fechar</span>
            </div>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
