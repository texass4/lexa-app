"use client"

import * as React from "react"
import type { AISources } from "@/lib/ai/types"
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

type Block = { type: "p"; text: string } | { type: "h"; text: string } | { type: "ul" | "ol"; items: string[] }

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

export function AIMarkdown({ text, sources, onOpen }: { text: string; sources: AISources; onOpen?: SourceHandler }) {
  const blocks = React.useMemo(() => parse(text), [text])
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
