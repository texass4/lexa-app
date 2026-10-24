import type { Tone } from "@/components/ui/badge"

export const PROJECT_STATUS_OPTIONS = [
  ["planned", "Planejado"],
  ["active", "Ativo"],
  ["paused", "Pausado"],
  ["completed", "Concluído"],
  ["archived", "Arquivado"],
] as const

export const PROJECT_TONE: Record<string, Tone> = { planned: "neutral", active: "active", paused: "warning", completed: "done", archived: "muted" }
