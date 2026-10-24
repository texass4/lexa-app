"use client"

import { Loader2, type LucideIcon } from "lucide-react"
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { cn } from "@/lib/cn"

export type SuggestionItem = {
  id: string
  title: string
  subtitle?: string
  icon?: LucideIcon
  group?: string
  hint?: string
}

export type SuggestionListHandle = { onKeyDown: (event: KeyboardEvent) => boolean }

/** Lista de sugestões do editor (menu "/" e menção "@"), navegável pelo teclado. */
export const SuggestionList = forwardRef<
  SuggestionListHandle,
  { items: SuggestionItem[]; command: (item: SuggestionItem) => void; loading?: boolean; empty?: string; query?: string }
>(function SuggestionList({ items, command, loading, empty, query }, ref) {
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  // Volta ao primeiro item quando a lista muda.
  const [seen, setSeen] = useState(items)
  if (seen !== items) {
    setSeen(items)
    setIndex(0)
  }
  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" })
  }, [index])

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowDown") {
        setIndex((i) => (items.length ? (i + 1) % items.length : 0))
        return true
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[index]
        if (item) command(item)
        return !!item
      }
      return false
    },
  }))

  let lastGroup: string | undefined
  return (
    <div ref={list} role="listbox" aria-label="Sugestões" className="max-h-80 w-72 overflow-y-auto rounded-md border border-line bg-white p-1 shadow-float">
      {items.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink-4">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {loading ? "Buscando…" : (empty ?? (query ? "Nada encontrado." : "Digite para buscar."))}
        </div>
      ) : null}
      {items.map((item, i) => {
        const header = item.group && item.group !== lastGroup ? item.group : null
        lastGroup = item.group
        const Icon = item.icon
        return (
          <div key={item.id}>
            {header ? <div className="eyebrow px-2.5 pt-2 pb-1">{header}</div> : null}
            <button
              type="button"
              role="option"
              aria-selected={i === index}
              data-index={i}
              onMouseEnter={() => setIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                command(item)
              }}
              className={cn("flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm", i === index ? "bg-cobalt-wash text-ink" : "text-ink-2")}
            >
              {Icon ? <Icon className="size-4 shrink-0 text-ink-4" /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.title}</span>
                {item.subtitle ? <span className="block truncate text-xs text-ink-4">{item.subtitle}</span> : null}
              </span>
              {item.hint ? <span className="meta shrink-0">{item.hint}</span> : null}
            </button>
          </div>
        )
      })}
    </div>
  )
})
