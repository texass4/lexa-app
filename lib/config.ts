import type { CSSProperties } from "react"
import type { ClientStatus, InvoiceStatus, PracticeArea, Priority, ProcessStatus } from "@/types"

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "gold" | "violet"

export const PRACTICE_AREAS: PracticeArea[] = ["Previdenciário", "Trabalhista", "Cível", "Família", "Empresarial", "Imobiliário"]

export const PRIORITY_CONFIG: Record<Priority, { label: string; tone: Tone; order: number }> = {
  alta: { label: "Alta", tone: "danger", order: 0 },
  media: { label: "Média", tone: "warning", order: 1 },
  baixa: { label: "Baixa", tone: "neutral", order: 2 },
}

export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  ativo: { label: "Ativo", tone: "success" },
  novo: { label: "Novo", tone: "info" },
  inativo: { label: "Inativo", tone: "neutral" },
  inadimplente: { label: "Inadimplente", tone: "danger" },
}

export const PROCESS_STATUS: Record<ProcessStatus, { label: string; tone: Tone }> = {
  em_andamento: { label: "Em andamento", tone: "info" },
  audiencia: { label: "Audiência", tone: "violet" },
  aguardando_documento: { label: "Aguardando documento", tone: "warning" },
  recurso: { label: "Em recurso", tone: "gold" },
  suspenso: { label: "Suspenso", tone: "neutral" },
  concluido: { label: "Concluído", tone: "success" },
}

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  pago: { label: "Pago", tone: "success" },
  pendente: { label: "A vencer", tone: "neutral" },
  atrasado: { label: "Em atraso", tone: "danger" },
}

/** Paleta das categorias de compromisso (tons do Notion + o dourado do LEXA). */
export const CATEGORY_COLORS: { name: string; value: string }[] = [
  { name: "Dourado", value: "#A88655" },
  { name: "Cinza", value: "#8A8580" },
  { name: "Marrom", value: "#9A6B4F" },
  { name: "Laranja", value: "#D9730D" },
  { name: "Amarelo", value: "#CB912F" },
  { name: "Verde", value: "#448361" },
  { name: "Azul", value: "#337EA9" },
  { name: "Roxo", value: "#9065B0" },
  { name: "Rosa", value: "#C14C8A" },
  { name: "Vermelho", value: "#D44C47" },
]

/** Cor de compromisso sem categoria. */
export const UNCATEGORIZED_COLOR = "var(--border-strong)"

/**
 * Estilos de uma cor de categoria, válidos no tema claro e no escuro:
 * `dot` (marcador), `bar` (borda de destaque), `soft` (fundo) e `text`.
 */
export function categoryStyle(color: string = UNCATEGORIZED_COLOR): Record<"dot" | "bar" | "soft" | "text", CSSProperties> {
  return {
    dot: { backgroundColor: color },
    bar: { borderLeftColor: color },
    soft: { backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)` },
    text: { color: `color-mix(in srgb, ${color} 72%, var(--foreground))` },
  }
}
