"use client"

import { CornerDownLeft } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { captureAction } from "@/app/actions/inbox"
import { createTaskAction } from "@/app/actions/tasks"
import { cn } from "@/lib/cn"

type Mode = "inbox" | "today"

/** Captura do dashboard: Enter guarda. Para a caixa de entrada ou direto como tarefa de hoje. */
export function QuickCapture({ today }: { today: string }) {
  const [mode, setMode] = useState<Mode>("inbox")
  const [value, setValue] = useState("")
  const [pending, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  const submit = () => {
    const content = value.trim()
    if (!content) return
    start(async () => {
      const result = mode === "inbox" ? await captureAction(content) : await createTaskAction({ title: content, dueDate: today })
      if (!result.ok) return void toast.error(result.error)
      setValue("")
      toast.success(mode === "inbox" ? "Guardado na caixa de entrada." : "Tarefa criada para hoje.")
      input.current?.focus()
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="group flex flex-col gap-2 rounded-md border border-line bg-white p-1.5 transition-colors focus-within:border-cobalt focus-within:shadow-[0_0_0_3px_var(--color-cobalt-soft)] sm:flex-row sm:items-center"
    >
      <label htmlFor="capture" className="sr-only">
        Capturar
      </label>
      <input
        ref={input}
        id="capture"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={mode === "inbox" ? "Capture uma ideia, tarefa ou anotação…" : "Nova tarefa para hoje…"}
        className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[0.9375rem] outline-none placeholder:text-ink-5"
        maxLength={10_000}
        disabled={pending}
      />
      <div className="flex items-center gap-1.5 px-1 pb-1 sm:pb-0">
        <div role="radiogroup" aria-label="Destino" className="flex rounded-sm bg-paper p-0.5">
          {(
            [
              ["inbox", "Caixa de entrada"],
              ["today", "Tarefa hoje"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn("h-7 rounded-xs px-2.5 text-xs transition-colors", mode === m ? "bg-white text-ink shadow-lift" : "text-ink-4 hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="flex h-8 items-center gap-1.5 rounded-sm bg-ink px-3 text-xs text-paper transition-colors hover:bg-ink-2 disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Guardar"}
          <CornerDownLeft className="size-3" />
        </button>
      </div>
    </form>
  )
}
