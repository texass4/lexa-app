"use client"

import { useReactFlow, type XYPosition } from "@xyflow/react"
import { useRef, useState } from "react"
import { cn } from "@/lib/cn"
import { PALETTE } from "./model"

/** Camada de desenho livre: captura o traço na tela e entrega os pontos no espaço do quadro. */
export function PenOverlay({ onFinish, onCancel }: { onFinish: (points: XYPosition[], color: string) => void; onCancel: () => void }) {
  const rf = useReactFlow()
  const [screen, setScreen] = useState<XYPosition[]>([])
  const [color, setColor] = useState<keyof typeof PALETTE.stroke>("ink")
  const flow = useRef<XYPosition[]>([])
  const drawing = useRef(false)
  const box = useRef<DOMRect | null>(null)

  const add = (e: React.PointerEvent) => {
    const rect = box.current!
    const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const last = flow.current[flow.current.length - 1]
    const point = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    // Descarta pontos quase iguais: traço mais leve e mais suave.
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return
    flow.current.push(point)
    setScreen((s) => [...s, local])
  }

  return (
    <div
      className="absolute inset-x-0 top-0 bottom-20 z-[5] cursor-crosshair touch-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        box.current = e.currentTarget.getBoundingClientRect()
        drawing.current = true
        flow.current = []
        setScreen([])
        add(e)
      }}
      onPointerMove={(e) => drawing.current && add(e)}
      onPointerUp={() => {
        if (!drawing.current) return
        drawing.current = false
        onFinish(flow.current, color)
        flow.current = []
        setScreen([])
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      role="application"
      aria-label="Área de desenho livre"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <path d={screen.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")} fill="none" stroke={PALETTE.stroke[color]} strokeWidth={2.5 * rf.getZoom()} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="absolute top-20 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md bg-nav p-1 shadow-float" onPointerDown={(e) => e.stopPropagation()}>
        {(Object.keys(PALETTE.stroke) as (keyof typeof PALETTE.stroke)[]).map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`} aria-pressed={color === c} className={cn("size-7 rounded-sm p-1.5", color === c && "bg-nav-3")}>
            <span className="block h-full w-full rounded-full border border-white/30" style={{ background: PALETTE.stroke[c] }} />
          </button>
        ))}
        <button onClick={onCancel} className="h-7 px-2 text-xs text-nav-text hover:text-paper">
          Concluir
        </button>
      </div>
    </div>
  )
}
