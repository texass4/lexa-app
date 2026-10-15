import Link from "next/link"
import { AlarmClock, CheckSquare, Gavel } from "lucide-react"
import { cn } from "cn"
import type { DayItem } from "@/lib/agenda/agenda"

const TONE = {
  fatal: "bg-danger-soft text-danger hover:bg-danger-soft/70",
  interno: "bg-warning-soft text-warning hover:bg-warning-soft/70",
  tarefa: "bg-violet-soft text-violet hover:bg-violet-soft/70",
}

/** Prazo ou tarefa no dia (faixa "Dia inteiro"): abre o processo ou a tarefa. `link: false` quando a pessoa não vê essa área. */
export function DayChip({ item, link, className }: { item: DayItem; link: boolean; className?: string }) {
  const tone = item.kind === "tarefa" ? "tarefa" : item.internal ? "interno" : "fatal"
  const Icon = item.kind === "tarefa" ? CheckSquare : item.internal ? AlarmClock : Gavel
  const prefix = item.kind === "tarefa" ? "Tarefa" : item.internal ? "Prazo interno" : "Prazo fatal"
  const body = (
    <>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </>
  )
  const cls = cn(
    "flex h-[22px] min-w-0 items-center gap-1 rounded-[6px] px-1.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
    TONE[tone],
    className,
  )
  const title = `${prefix}: ${item.label}`
  if (!link)
    return (
      <span className={cls} title={title}>
        {body}
      </span>
    )
  const href = item.kind === "prazo" ? `/processos/${item.processId}` : `/tarefas?tarefa=${item.id}`
  return (
    <Link href={href} className={cls} title={title}>
      {body}
    </Link>
  )
}
