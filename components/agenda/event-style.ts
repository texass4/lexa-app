import type { CSSProperties } from "react"
import type { AppointmentStatus } from "@/types"

const NEUTRAL = "var(--border-strong)"

/**
 * Cores de um compromisso na grade: fundo bem visível (20% da cor sobre o cartão),
 * barra na cor cheia e texto escurecido para ler nos dois temas. Cancelado vira
 * contorno tracejado, sem fundo; realizado fica mais suave.
 */
export function eventTone(color: string | undefined, status: AppointmentStatus = "planejado") {
  const c = color ?? NEUTRAL
  const text: CSSProperties = { color: `color-mix(in srgb, ${c} 78%, var(--foreground))` }
  const bar: CSSProperties = { borderLeftColor: c }
  if (status === "cancelado") {
    return {
      card: {
        backgroundColor: "transparent",
        borderColor: `color-mix(in srgb, ${c} 55%, transparent)`,
        borderStyle: "dashed",
        borderWidth: 1.5,
      } as CSSProperties,
      bar: {} as CSSProperties,
      text: { color: "var(--muted-foreground)" } as CSSProperties,
      dot: { backgroundColor: c } as CSSProperties,
    }
  }
  return {
    card: { backgroundColor: `color-mix(in srgb, ${c} ${status === "realizado" ? 12 : 20}%, var(--card))` } as CSSProperties,
    bar,
    text,
    dot: { backgroundColor: c } as CSSProperties,
  }
}
