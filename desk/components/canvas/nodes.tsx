"use client"

import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react"
import { ArrowUpRight, CalendarClock, Link2, Trash2, Unlink } from "lucide-react"
import Link from "next/link"
import { memo, useEffect, useRef, useState, type ReactNode } from "react"
import { useRefs } from "@/components/editor/refs-context"
import { REF_ICON } from "@/components/shell/ref-icons"
import { PriorityMark } from "@/components/ui/badge"
import { ProgressBar } from "@/components/ui/progress"
import { cn } from "@/lib/cn"
import { formatLocalDate } from "@/lib/domain/dates"
import { REF_LABEL } from "@/lib/domain/refs"
import { useCanvas } from "./canvas-context"
import { PALETTE, type CanvasNode } from "./model"

type P = NodeProps<CanvasNode>
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback)

/** Pontos de conexão nos quatro lados (qualquer um conecta com qualquer outro). */
function Handles() {
  return (
    <>
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
    </>
  )
}

function Resizer({ selected, minWidth = 60, minHeight = 32, keepAspectRatio }: { selected: boolean; minWidth?: number; minHeight?: number; keepAspectRatio?: boolean }) {
  const { checkpoint } = useCanvas()
  return <NodeResizer isVisible={selected} minWidth={minWidth} minHeight={minHeight} keepAspectRatio={keepAspectRatio} onResizeStart={checkpoint} />
}

/** Texto editável no próprio elemento (duplo clique). Grava ao sair do campo. */
function EditableText({ id, field, value, placeholder, className, multiline = true }: { id: string; field: string; value: string; placeholder: string; className?: string; multiline?: boolean }) {
  const { updateData, editingId, setEditingId } = useCanvas()
  const editing = editingId === `${id}:${field}`
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing) {
      setDraft(value) // eslint-disable-line react-hooks/set-state-in-effect -- começa a edição a partir do valor salvo
      requestAnimationFrame(() => {
        ref.current?.focus()
        ref.current?.select()
      })
    }
  }, [editing, value])
  if (!editing) {
    return (
      <div
        className={cn("break-words whitespace-pre-wrap", !value && "text-ink-5", className)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setEditingId(`${id}:${field}`)
        }}
      >
        {value || placeholder}
      </div>
    )
  }
  const commit = () => {
    setEditingId(null)
    if (draft !== value) updateData(id, { [field]: draft }, { checkpoint: true })
  }
  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(multiline ? e.target.value : e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape" || (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          commit()
        }
      }}
      className={cn("nodrag nopan nowheel w-full resize-none bg-transparent outline-none", className)}
      rows={multiline ? 3 : 1}
      maxLength={20000}
      aria-label="Editar texto"
    />
  )
}

export const CardNode = memo(function CardNode({ id, data, selected }: P) {
  const accent = PALETTE.accent[str(data.data.color, "none") as keyof typeof PALETTE.accent] ?? "transparent"
  return (
    <div className={cn("flex h-full w-full flex-col overflow-hidden rounded-sm border bg-white", selected ? "border-cobalt" : "border-line-strong")} style={{ borderTop: accent !== "transparent" ? `3px solid ${accent}` : undefined }}>
      <Resizer selected={selected} minWidth={120} minHeight={56} />
      <Handles />
      <div className="px-3 pt-2.5">
        <EditableText id={id} field="title" value={str(data.data.title)} placeholder="Título" multiline={false} className="text-sm font-semibold text-ink" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3 pt-1 pb-2.5">
        <EditableText id={id} field="body" value={str(data.data.body)} placeholder="Duplo clique para escrever" className="text-xs leading-relaxed text-ink-3" />
      </div>
    </div>
  )
})

export const ShapeNode = memo(function ShapeNode({ id, data, selected }: P) {
  const shape = str(data.data.shape, "rect")
  const fillKey = str(data.data.color, "white") as keyof typeof PALETTE.fill
  const fill = PALETTE.fill[fillKey] ?? "#FFFFFF"
  const dark = fillKey === "ink"
  const stroke = selected ? "#5269FF" : dark ? "#171A21" : "#C4BFB1"
  return (
    <div className="relative h-full w-full">
      <Resizer selected={selected} minWidth={40} minHeight={30} />
      <Handles />
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {shape === "ellipse" ? (
          <ellipse cx="50" cy="50" rx="49.5" ry="49.5" fill={fill} stroke={stroke} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        ) : shape === "diamond" ? (
          <polygon points="50,0.5 99.5,50 50,99.5 0.5,50" fill={fill} stroke={stroke} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        ) : (
          <rect x="0.5" y="0.5" width="99" height="99" rx="3" fill={fill} stroke={stroke} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className={cn("absolute inset-0 flex items-center justify-center text-center", shape === "diamond" ? "px-[22%] py-[22%]" : "px-3 py-2")}>
        <EditableText id={id} field="text" value={str(data.data.text)} placeholder="Texto" className={cn("w-full text-center text-sm", dark ? "text-paper" : "text-ink")} />
      </div>
    </div>
  )
})

const TEXT_SIZES: Record<string, string> = { s: "text-sm", m: "text-lg", l: "text-2xl font-serif", xl: "text-4xl font-serif tracking-tight" }

export const TextNode = memo(function TextNode({ id, data, selected }: P) {
  return (
    <div className={cn("h-full w-full rounded-xs px-1", selected && "outline outline-1 outline-cobalt/60")}>
      <Resizer selected={selected} minWidth={40} minHeight={24} />
      <Handles />
      <EditableText id={id} field="text" value={str(data.data.text)} placeholder="Texto livre" className={cn("leading-snug text-ink", TEXT_SIZES[str(data.data.size, "m")])} />
    </div>
  )
})

export const StickyNode = memo(function StickyNode({ id, data, selected }: P) {
  const color = PALETTE.sticky[str(data.data.color, "yellow") as keyof typeof PALETTE.sticky] ?? PALETTE.sticky.yellow
  return (
    <div className={cn("h-full w-full p-3.5 shadow-[0_1px_0_rgba(23,26,33,0.06),0_6px_14px_-8px_rgba(23,26,33,0.35)]", selected && "outline outline-2 outline-cobalt")} style={{ background: color }}>
      <Resizer selected={selected} minWidth={80} minHeight={60} />
      <Handles />
      <EditableText id={id} field="text" value={str(data.data.text)} placeholder="Nota adesiva" className="h-full overflow-hidden text-[0.9375rem] leading-snug text-ink" />
    </div>
  )
})

export const FrameNode = memo(function FrameNode({ id, data, selected }: P) {
  const color = PALETTE.frame[str(data.data.color, "paper") as keyof typeof PALETTE.frame] ?? PALETTE.frame.paper
  return (
    <div className={cn("relative h-full w-full rounded-md border", selected ? "border-cobalt" : "border-line-strong/70")} style={{ background: `${color}B3` }}>
      <Resizer selected={selected} minWidth={160} minHeight={100} />
      <div className="frame-handle absolute -top-7 left-0 flex max-w-full cursor-grab items-center rounded-t-sm px-1 active:cursor-grabbing">
        <EditableText id={id} field="title" value={str(data.data.title)} placeholder="Grupo" multiline={false} className="eyebrow truncate !text-ink-3" />
      </div>
    </div>
  )
})

export const DrawingNode = memo(function DrawingNode({ data, selected }: P) {
  const points = (Array.isArray(data.data.points) ? data.data.points : []) as [number, number][]
  const maxX = Math.max(1, ...points.map((p) => p[0]))
  const maxY = Math.max(1, ...points.map((p) => p[1]))
  const stroke = PALETTE.stroke[str(data.data.color, "ink") as keyof typeof PALETTE.stroke] ?? PALETTE.stroke.ink
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")
  return (
    <div className={cn("h-full w-full", selected && "outline outline-1 outline-dashed outline-cobalt")}>
      <Resizer selected={selected} minWidth={10} minHeight={10} />
      <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${maxX} ${maxY}`} preserveAspectRatio="none" aria-label="Desenho livre" role="img">
        <path d={d} fill="none" stroke={stroke} strokeWidth={Number(data.data.strokeWidth ?? 2.5)} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
})

/** Elemento vinculado: mostra o estado atual do registro original, nunca uma cópia. */
export const RecordNode = memo(function RecordNode({ id, data, selected }: P) {
  const refs = useRefs()
  const { relink, removeElement } = useCanvas()
  const ref = data.ref
  const summary = ref ? refs.get(ref) : undefined
  const missing = !ref || refs.isMissing(ref)
  if (!ref) return null
  const Icon = REF_ICON[ref.type]

  let body: ReactNode
  if (missing) {
    body = (
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5 text-clay">
          <Unlink className="size-3.5" />
          <span className="text-xs font-semibold">Referência indisponível</span>
        </div>
        <p className="text-xs text-ink-3">{REF_LABEL[ref.type]} excluída(o) ou inacessível. Vincule a outro registro ou remova o elemento.</p>
        <div className="nodrag mt-auto flex gap-1.5">
          <button onClick={() => relink(id)} className="inline-flex h-6 items-center gap-1 rounded-xs border border-line bg-white px-2 text-[11px] hover:border-cobalt">
            <Link2 className="size-3" /> Vincular
          </button>
          <button onClick={() => removeElement(id)} className="inline-flex h-6 items-center gap-1 rounded-xs px-2 text-[11px] text-clay hover:bg-clay-soft">
            <Trash2 className="size-3" /> Remover
          </button>
        </div>
      </div>
    )
  } else if (!summary) {
    body = <div className="h-full animate-pulse p-3 text-xs text-ink-4">Carregando {REF_LABEL[ref.type].toLowerCase()}…</div>
  } else {
    body = (
      <div className="flex h-full flex-col p-3">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-ink-4" />
          <span className="eyebrow">{REF_LABEL[ref.type]}</span>
          {summary.meta ? <span className="meta truncate">{summary.meta.split(" · ")[0]}</span> : null}
          <Link href={summary.href} className="nodrag ml-auto rounded-xs p-0.5 text-ink-4 hover:bg-paper hover:text-cobalt" aria-label={`Abrir ${summary.title}`} title="Abrir registro original">
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        <p className={cn("mt-1.5 line-clamp-2 text-sm leading-snug font-medium text-ink", summary.statusTone === "done" && "text-ink-4 line-through")}>{summary.title}</p>
        <div className="mt-auto flex items-center gap-2 pt-2">
          {summary.status ? (
            <span
              className={cn(
                "rounded-xs px-1.5 py-0.5 text-[10px] font-medium",
                summary.statusTone === "done" ? "bg-sage-soft text-sage-ink" : summary.statusTone === "active" ? "bg-cobalt-soft text-cobalt-ink" : summary.statusTone === "muted" ? "bg-paper-2 text-ink-4" : "bg-paper-2 text-ink-3",
              )}
            >
              {summary.status}
            </span>
          ) : null}
          {summary.dueDate && ref.type !== "journal" ? (
            <span className={cn("meta inline-flex items-center gap-1", summary.overdue && "font-medium text-clay")}>
              <CalendarClock className="size-3" />
              {formatLocalDate(summary.dueDate, { day: "numeric", month: "short" })}
            </span>
          ) : null}
          {ref.type === "project" ? <ProgressBar progress={summary.progress ?? null} className="min-w-0 flex-1" showLabel={false} /> : null}
          {(ref.type === "page" || ref.type === "journal") && summary.excerpt ? <span className="truncate text-[11px] text-ink-4">{summary.excerpt}</span> : null}
          {summary.priority ? <PriorityMark priority={summary.priority} className="ml-auto" /> : null}
        </div>
      </div>
    )
  }
  return (
    <div
      className={cn(
        "h-full w-full overflow-hidden rounded-sm border-l-[3px] bg-white shadow-lift",
        missing ? "border border-dashed border-clay/60 bg-clay-soft/30" : selected ? "border border-l-[3px] border-cobalt" : "border border-l-[3px] border-line-strong",
        !missing && (ref.type === "task" ? "border-l-cobalt" : ref.type === "project" ? "border-l-ink" : ref.type === "page" ? "border-l-sage-ink" : "border-l-amber"),
      )}
    >
      <Resizer selected={selected} minWidth={200} minHeight={90} />
      <Handles />
      {body}
    </div>
  )
})

export const NODE_TYPES = {
  card: CardNode,
  shape: ShapeNode,
  text: TextNode,
  sticky: StickyNode,
  frame: FrameNode,
  drawing: DrawingNode,
  record: RecordNode,
}
