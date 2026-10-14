"use client"

import { useWindowWidth } from "@/lib/core/hooks"
import { useUI } from "@/lib/store/ui-store"

/** Largura do Assistente Íntegra: normal e expandido. */
export const ASSISTANT_WIDTH = { normal: 400, expanded: 560 } as const

/** Espaço mínimo que o conteúdo da página mantém ao lado do assistente acoplado. */
const MIN_CONTENT = 760

/**
 * Onde o assistente cabe: acoplado à direita (o conteúdo abre espaço) só quando sobram
 * pelo menos 760 px para a página, descontada a barra lateral. Senão, ele abre por cima,
 * como painel — a página nunca fica espremida nem com rolagem horizontal.
 */
export function useAssistantLayout(expanded: boolean) {
  const { sidebarCollapsed } = useUI()
  const width = useWindowWidth()
  const sidebar = width >= 1024 ? (sidebarCollapsed ? 72 : 248) : width >= 768 ? 72 : 0
  const panel = expanded ? ASSISTANT_WIDTH.expanded : ASSISTANT_WIDTH.normal
  return { width: panel, docked: width > 0 && width - sidebar - panel >= MIN_CONTENT }
}
