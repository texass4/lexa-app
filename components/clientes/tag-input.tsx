"use client"

import * as React from "react"
import { Plus, X } from "lucide-react"
import { cn } from "cn"
import { normalize } from "@/lib/format"
import { normalizeTags } from "@/lib/clients"

/** Campo de tags: Enter ou vírgula adiciona; sugere as tags já usadas no escritório. */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
}: {
  id: string
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
}) {
  const [draft, setDraft] = React.useState("")
  const selected = new Set(value.map(normalize))
  const q = normalize(draft.trim())
  const options = suggestions.filter((t) => !selected.has(normalize(t)) && (!q || normalize(t).includes(q))).slice(0, 6)

  const add = (tag: string) => {
    onChange(normalizeTags([...value, tag]))
    setDraft("")
  }

  return (
    <div className="space-y-2">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-[9px] border border-input bg-surface px-2 py-1.5 shadow-xs transition-[border-color,box-shadow] focus-within:border-gold/55 focus-within:ring-3 focus-within:ring-gold/12 hover:border-border-strong">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-muted/60 pr-1 pl-2 text-[12px] font-medium"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remover tag ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="flex size-4 items-center justify-center rounded text-subtle outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? "" : "Digite e tecle Enter"}
          onChange={(e) => {
            const text = e.target.value
            if (text.includes(",")) {
              onChange(normalizeTags([...value, ...text.split(",")]))
              setDraft("")
            } else setDraft(text)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              if (draft.trim()) add(draft)
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-[14px] outline-none placeholder:text-subtle sm:text-[13.5px]"
        />
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-subtle">Usadas no escritório:</span>
          {options.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(tag)}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border-strong px-1.5 text-[11.5px] font-medium text-muted-foreground outline-none",
                "hover:border-solid hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 [&_svg]:size-3",
              )}
            >
              <Plus /> {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
