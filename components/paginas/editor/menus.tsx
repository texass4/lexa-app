"use client"

import * as React from "react"
import { FileText, ListChecks, Scale, UserRound } from "lucide-react"
import { cn } from "cn"
import type { MentionItem, MenuHandle, MenuProps, SlashItem } from "./extensions"

/** Navegação por teclado comum aos menus do editor (↑ ↓ Enter Tab). */
function useMenuKeys<I>(items: I[], command: (item: I) => void, ref: React.Ref<MenuHandle>) {
  const [index, setIndex] = React.useState(0)
  const [seen, setSeen] = React.useState(items)
  if (seen !== items) {
    setSeen(items)
    setIndex(0)
  }
  React.useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[index]
        if (item) command(item)
        return true
      }
      return false
    },
  }))
  return [index, setIndex] as const
}

const panel =
  "w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-[12px] border border-border bg-popover p-1 text-popover-foreground shadow-float"

function useScrollIntoView(index: number) {
  const listRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" })
  }, [index])
  return listRef
}

export const SlashMenu = React.forwardRef<MenuHandle, MenuProps<SlashItem>>(function SlashMenu({ items, command }, ref) {
  const [index, setIndex] = useMenuKeys(items, command, ref)
  const listRef = useScrollIntoView(index)
  return (
    <div className={panel} role="listbox" aria-label="Inserir bloco">
      <div ref={listRef} className="max-h-[min(360px,50vh)] overflow-y-auto">
        {items.length === 0 && <p className="px-3 py-2.5 text-[13px] text-muted-foreground">Nenhum bloco com esse nome.</p>}
        {items.map((item, i) => {
          const header = i === 0 || items[i - 1].group !== item.group ? item.group : null
          const Icon = item.icon
          return (
            <React.Fragment key={item.id}>
              {header && <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-medium tracking-[0.1em] text-subtle uppercase">{header}</p>}
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                data-index={i}
                onMouseEnter={() => setIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => command(item)}
                className={cn("flex w-full items-center gap-3 rounded-[8px] px-2 py-1.5 text-left outline-none", i === index && "bg-accent")}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-border bg-surface text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">{item.label}</span>
                  {item.hint && <span className="block truncate text-[11.5px] text-muted-foreground">{item.hint}</span>}
                </span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
})

const MENTION_ICON = { client: UserRound, process: Scale, task: ListChecks, page: FileText }
const MENTION_GROUP = { client: "Clientes", process: "Processos", task: "Tarefas", page: "Páginas" }

export const MentionMenu = React.forwardRef<MenuHandle, MenuProps<MentionItem>>(function MentionMenu({ items, query, command }, ref) {
  const [index, setIndex] = useMenuKeys(items, command, ref)
  const listRef = useScrollIntoView(index)
  return (
    <div className={panel} role="listbox" aria-label="Mencionar cliente, processo, tarefa ou página">
      <div ref={listRef} className="max-h-[min(360px,50vh)] overflow-y-auto">
        {items.length === 0 && (
          <p className="px-3 py-2.5 text-[13px] text-muted-foreground">
            {query ? `Nada encontrado para "${query}".` : "Digite para buscar clientes, processos, tarefas ou páginas."}
          </p>
        )}
        {items.map((item, i) => {
          const header = i === 0 || items[i - 1].kind !== item.kind ? MENTION_GROUP[item.kind] : null
          const Icon = MENTION_ICON[item.kind]
          return (
            <React.Fragment key={`${item.kind}:${item.id}`}>
              {header && <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-medium tracking-[0.1em] text-subtle uppercase">{header}</p>}
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                data-index={i}
                onMouseEnter={() => setIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => command(item)}
                className={cn("flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left outline-none", i === index && "bg-accent")}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-foreground">{item.label}</span>
                  {item.detail && <span className="block truncate text-[11.5px] text-muted-foreground">{item.detail}</span>}
                </span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
})
