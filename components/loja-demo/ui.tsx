"use client"

import { useState } from "react"
import { Battery, Signal, Wifi, Moon, ChevronLeft } from "lucide-react"
import { useStore } from "./store"

// Paleta própria da demo — laranja/coral, deliberadamente diferente de qualquer marca real.
export const THEME = {
  accent: "#F5451E",
  accentDeep: "#E23A16",
  sale: "linear-gradient(90deg,#FF7A18 0%,#FF3D3D 100%)",
  ink: "#17181c",
  muted: "#8b8d94",
  faint: "#b6b8be",
  line: "#ececed",
  bg: "#f4f4f5",
  surface: "#ffffff",
  anno: "#4f46e5",
}

/** Barra de status fake do topo (relógio + ícones), como nos mockups. */
export function StatusBar({ time = "00:31" }: { time?: string }) {
  return (
    <div className="flex items-center justify-between px-5 pt-2 pb-1 text-[13px] font-semibold" style={{ color: THEME.ink }}>
      <span className="flex items-center gap-1 tabular-nums">
        {time}
        <Moon size={13} className="fill-current" />
      </span>
      <span className="flex items-center gap-1.5">
        <Signal size={14} />
        <Wifi size={14} />
        <Battery size={18} className="rotate-0" />
      </span>
    </div>
  )
}

/** Ilustração SVG do produto (escova elétrica) — self-contained, sem imagem externa. */
export function ProductArt({ color = "#2b2b2f", size = 180, className = "" }: { color?: string; size?: number; className?: string }) {
  const light = color === "#f3f4f6" || color === "#f6c8d4"
  const bristle = light ? "#9aa0ab" : "#c9ccd3"
  const stroke = light ? "#d7d9de" : "transparent"
  return (
    <svg viewBox="0 0 80 240" width={size * (80 / 240)} height={size} className={className} aria-hidden>
      {/* cerdas */}
      <g fill={bristle}>
        {Array.from({ length: 5 }).map((_, i) => (
          <rect key={i} x={28 + i * 5} y={6} width={3} height={26} rx={1.5} />
        ))}
      </g>
      {/* cabeça */}
      <rect x={30} y={28} width={20} height={20} rx={8} fill={color} stroke={stroke} />
      {/* haste */}
      <rect x={34} y={44} width={12} height={40} rx={6} fill={color} stroke={stroke} />
      {/* corpo */}
      <rect x={24} y={78} width={32} height={150} rx={16} fill={color} stroke={stroke} />
      {/* botão power */}
      <circle cx={40} cy={110} r={6} fill="none" stroke={light ? "#b9803f" : "#c79a5c"} strokeWidth={1.6} />
      <rect x={39} y={104} width={2} height={7} rx={1} fill={light ? "#b9803f" : "#c79a5c"} />
      {/* indicadores de modo */}
      <g fill="none" stroke={light ? "#c7c9ce" : "#55575e"} strokeWidth={1.4}>
        {Array.from({ length: 4 }).map((_, i) => (
          <circle key={i} cx={40} cy={132 + i * 16} r={3.4} />
        ))}
      </g>
    </svg>
  )
}

export function Stars({ value = 5, size = 12 }: { value?: number; size?: number }) {
  return (
    <span className="inline-flex" style={{ color: "#f5a623" }} aria-label={`${value} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" fill={i < value ? "currentColor" : "#e2e3e6"}>
          <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.9l-4.95 2.6.95-5.5-4-3.9 5.53-.8z" />
        </svg>
      ))}
    </span>
  )
}

/**
 * Marcador de anotação de gatilho de conversão. Só aparece quando o modo
 * anotações está ligado. Ao tocar, mostra o nome e a explicação do gatilho.
 */
export function Anno({ n, label, note, side = "right" }: { n: number; label: string; note: string; side?: "left" | "right" }) {
  const { annotations } = useStore()
  const [open, setOpen] = useState(false)
  if (!annotations) return null
  return (
    <span className="relative z-30 inline-block align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-bold text-white shadow ring-2 ring-white"
        style={{ background: THEME.anno }}
        aria-label={`Gatilho ${n}: ${label}`}
      >
        {n}
      </button>
      {open ? (
        <span
          className="absolute top-6 z-40 block w-56 rounded-xl p-3 text-left text-[12px] leading-snug text-white shadow-xl"
          style={{ background: "#111827", [side === "right" ? "right" : "left"]: 0 }}
        >
          <span className="mb-0.5 block font-semibold" style={{ color: "#c7d2fe" }}>
            {n}. {label}
          </span>
          <span className="block text-white/85">{note}</span>
        </span>
      ) : null}
    </span>
  )
}

/** Divisória fina cinza, como as faixas separadoras das telas. */
export function Gap({ h = 8 }: { h?: number }) {
  return <div style={{ height: h, background: THEME.bg }} />
}

/** Cabeçalho com voltar + título centralizado, usado nas telas internas. */
export function TopBar({ title, right }: { title?: React.ReactNode; right?: React.ReactNode }) {
  const { back } = useStore()
  return (
    <div className="flex items-center gap-2 border-b px-2 py-2.5" style={{ borderColor: THEME.line, background: THEME.surface }}>
      <button onClick={back} aria-label="Voltar" className="p-1">
        <ChevronLeft size={24} style={{ color: THEME.ink }} />
      </button>
      <div className="flex-1 truncate text-center text-[15px] font-semibold" style={{ color: THEME.ink }}>{title}</div>
      <div className="min-w-8 pr-1 text-right">{right}</div>
    </div>
  )
}
