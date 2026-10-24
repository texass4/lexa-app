"use client"

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/cn"
import { useCanvasEdges } from "./edge-context"
import { PALETTE, type CanvasEdge } from "./model"

/** Conector com seta opcional e rótulo editável (duplo clique). Puramente visual. */
export function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<CanvasEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 })
  const { updateEdge, editingEdgeId, setEditingEdgeId } = useCanvasEdges()
  const style = data?.style ?? {}
  const color = PALETTE.stroke[(style.color ?? "") as keyof typeof PALETTE.stroke] ?? "#545862"
  const stroke = selected ? "#5269FF" : color
  const editing = editingEdgeId === id
  const [draft, setDraft] = useState(data?.label ?? "")
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) {
      setDraft(data?.label ?? "") // eslint-disable-line react-hooks/set-state-in-effect -- edição parte do rótulo salvo
      requestAnimationFrame(() => input.current?.focus())
    }
  }, [editing, data?.label])
  const markerId = `arrow-${id}`
  const commit = () => {
    setEditingEdgeId(null)
    if (draft !== (data?.label ?? "")) updateEdge(id, { label: draft.trim() })
  }
  return (
    <>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={stroke} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={style.arrowEnd !== false ? `url(#${markerId})` : undefined}
        markerStart={style.arrowStart ? `url(#${markerId})` : undefined}
        style={{ stroke, strokeWidth: selected ? 2 : 1.5, strokeDasharray: style.dashed ? "6 5" : undefined }}
        interactionWidth={18}
      />
      <EdgeLabelRenderer>
        <div className="nodrag nopan absolute" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}>
          {editing ? (
            <input
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === "Enter" || e.key === "Escape") commit()
              }}
              maxLength={500}
              aria-label="Rótulo da conexão"
              className="h-6 w-36 rounded-xs border border-cobalt bg-white px-1.5 text-center text-xs outline-none"
            />
          ) : data?.label ? (
            <button
              onDoubleClick={() => setEditingEdgeId(id)}
              className={cn("rounded-xs border bg-paper px-1.5 py-0.5 text-xs text-ink-2", selected ? "border-cobalt" : "border-line")}
              title="Duplo clique para editar"
            >
              {data.label}
            </button>
          ) : selected ? (
            <button onClick={() => setEditingEdgeId(id)} className="rounded-xs border border-dashed border-cobalt bg-white px-1.5 py-0.5 text-[11px] text-cobalt-ink">
              + rótulo
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const EDGE_TYPES = { labeled: LabeledEdge }
