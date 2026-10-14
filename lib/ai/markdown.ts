/**
 * O que a tela da conversa mostra de uma resposta da IA: o texto limpo (sem nenhum nome
 * interno dos dados) já dividido em blocos — títulos, parágrafos e listas. Puro: o
 * `AIMarkdown` só desenha estes blocos (negrito e "[J1]" viram elementos lá).
 *
 * Toda resposta passa por aqui na hora de aparecer — a nova, a que veio do histórico, a
 * guardada antes da limpeza existir e a que ainda está sendo gerada (`streaming`).
 */

import { sanitizeAIText, streamingView } from "./output-sanitizer"
import type { AISources } from "./types"

export type Block = { type: "p"; text: string } | { type: "h"; text: string } | { type: "ul" | "ol"; items: string[] }

export function chatBlocks(text: string, { sources, streaming = false }: { sources: AISources; streaming?: boolean }): Block[] {
  const options = { sources, linkBareRefs: true }
  return parse(streaming ? streamingView(text, options) : sanitizeAIText(text, options))
}

function parse(markdown: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join(" ") })
    paragraph = []
  }

  for (const raw of markdown.split("\n")) {
    const line = raw.trim()
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (!line) {
      flush()
    } else if (heading) {
      flush()
      blocks.push({ type: "h", text: heading[1] })
    } else if (bullet || numbered) {
      flush()
      const type = bullet ? "ul" : "ol"
      const last = blocks[blocks.length - 1]
      const item = (bullet ?? numbered)![1]
      if (last?.type === type) last.items.push(item)
      else blocks.push({ type, items: [item] })
    } else {
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}

