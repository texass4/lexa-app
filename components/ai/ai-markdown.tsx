"use client"

import * as React from "react"
import type { AISources } from "@/lib/ai/types"
import { chatBlocks } from "@/lib/ai/markdown"
import { SourceChip, type SourceHandler } from "./ai-blocks"

/**
 * Markdown mínimo e seguro para as respostas do chat: títulos, listas,
 * negrito e citações de fonte ("[M3]"). Monta elementos React — nunca injeta
 * HTML vindo do modelo.
 */

const INLINE = /(\*\*[^*\n]+\*\*|\[[A-Z]\d{1,3}\])/g

function Inline({ text, sources, onOpen }: { text: string; sources: AISources; onOpen?: SourceHandler }) {
  return (
    <>
      {text.split(INLINE).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          )
        }
        const ref = /^\[([A-Z]\d{1,3})\]$/.exec(part)?.[1]
        if (ref) {
          const source = sources[ref]
          return source ? <SourceChip key={i} source={source} onOpen={onOpen} /> : null
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </>
  )
}

/**
 * `streaming`: o texto ainda está sendo gerado — só aparece a parte que já não pode virar
 * marcador interno. Em qualquer caso, o texto passa pela limpeza final (também o que veio
 * do histórico ou de uma resposta antiga): nenhum nome interno dos dados chega à tela.
 */
export function AIMarkdown({ text, sources, onOpen, streaming = false }: { text: string; sources: AISources; onOpen?: SourceHandler; streaming?: boolean }) {
  const blocks = React.useMemo(() => chatBlocks(text, { sources, streaming }), [text, sources, streaming])
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed break-words text-foreground">
      {blocks.map((block, i) => {
        if (block.type === "h") {
          return (
            <p key={i} className="pt-1 text-[13px] font-semibold text-foreground">
              <Inline text={block.text} sources={sources} onOpen={onOpen} />
            </p>
          )
        }
        if (block.type === "p") {
          return (
            <p key={i}>
              <Inline text={block.text} sources={sources} onOpen={onOpen} />
            </p>
          )
        }
        const List = block.type
        return (
          <List key={i} className={List === "ul" ? "list-disc space-y-1 pl-5 marker:text-subtle" : "list-decimal space-y-1 pl-5 marker:text-subtle"}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Inline text={item} sources={sources} onOpen={onOpen} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
