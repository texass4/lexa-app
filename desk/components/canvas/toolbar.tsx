"use client"

import { Circle, Diamond, Hand, Link2, Maximize, Minus, MousePointer2, PenLine, Plus, Redo2, Square, StickyNote, Type, Undo2, Frame, RectangleHorizontal, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/cn"

export type Tool = "select" | "hand" | "card" | "shape" | "text" | "sticky" | "frame" | "pen" | "record"
export type ShapeKind = "rect" | "ellipse" | "diamond"

const TOOLS: { id: Tool; label: string; key: string; icon: LucideIcon }[] = [
  { id: "select", label: "Selecionar", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Mover o quadro", key: "H", icon: Hand },
  { id: "card", label: "Cartão", key: "C", icon: RectangleHorizontal },
  { id: "shape", label: "Forma", key: "R", icon: Square },
  { id: "text", label: "Texto", key: "T", icon: Type },
  { id: "sticky", label: "Nota adesiva", key: "S", icon: StickyNote },
  { id: "frame", label: "Grupo (frame)", key: "F", icon: Frame },
  { id: "pen", label: "Desenho livre", key: "P", icon: PenLine },
  { id: "record", label: "Registro (tarefa, projeto, página, diário)", key: "L", icon: Link2 },
]

const SHAPES: { id: ShapeKind; label: string; icon: LucideIcon }[] = [
  { id: "rect", label: "Retângulo", icon: Square },
  { id: "ellipse", label: "Elipse", icon: Circle },
  { id: "diamond", label: "Losango", icon: Diamond },
]

export function Toolbar(props: {
  tool: Tool
  onTool: (t: Tool) => void
  shape: ShapeKind
  onShape: (s: ShapeKind) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}) {
  const btn = (active: boolean) =>
    cn("flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors [&_svg]:size-[1.1rem] disabled:opacity-30", active ? "bg-cobalt text-white" : "text-nav-text hover:bg-nav-3 hover:text-paper")
  return (
    <div className="flex flex-col items-center gap-2">
      {props.tool === "shape" ? (
        <div className="flex gap-0.5 rounded-md bg-nav p-1 shadow-float" role="radiogroup" aria-label="Tipo de forma">
          {SHAPES.map((s) => (
            <button key={s.id} role="radio" aria-checked={props.shape === s.id} onClick={() => props.onShape(s.id)} className={btn(props.shape === s.id)} aria-label={s.label} title={s.label}>
              <s.icon />
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-nav p-1 shadow-float" role="toolbar" aria-label="Ferramentas do quadro">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => props.onTool(t.id)} aria-pressed={props.tool === t.id} className={btn(props.tool === t.id)} aria-label={`${t.label} (${t.key})`} title={`${t.label} — ${t.key}`}>
            <t.icon />
          </button>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-nav-3" />
        <button onClick={props.onUndo} disabled={!props.canUndo} className={btn(false)} aria-label="Desfazer (Ctrl Z)" title="Desfazer — Ctrl Z">
          <Undo2 />
        </button>
        <button onClick={props.onRedo} disabled={!props.canRedo} className={btn(false)} aria-label="Refazer (Ctrl Shift Z)" title="Refazer — Ctrl Shift Z">
          <Redo2 />
        </button>
        <span className="mx-1 h-5 w-px shrink-0 bg-nav-3" />
        <button onClick={props.onZoomOut} className={btn(false)} aria-label="Diminuir zoom" title="Diminuir zoom">
          <Minus />
        </button>
        <button onClick={props.onZoomIn} className={btn(false)} aria-label="Aumentar zoom" title="Aumentar zoom">
          <Plus />
        </button>
        <button onClick={props.onFit} className={btn(false)} aria-label="Ver todos os elementos (Shift 1)" title="Ver tudo — Shift 1">
          <Maximize />
        </button>
      </div>
    </div>
  )
}
