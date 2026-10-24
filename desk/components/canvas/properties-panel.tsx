"use client"

import { ArrowUpRight, BringToFront, CheckCircle2, Copy, Link2, RotateCcw, SendToBack, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTransition } from "react"
import { toast } from "sonner"
import { setTaskStatusAction } from "@/app/actions/tasks"
import { useRefs } from "@/components/editor/refs-context"
import { cn } from "@/lib/cn"
import { REF_LABEL } from "@/lib/domain/refs"
import { PALETTE, type CanvasEdge, type CanvasNode, type EdgeData } from "./model"

const KIND_LABEL: Record<string, string> = { card: "Cartão", shape: "Forma", text: "Texto", sticky: "Nota adesiva", frame: "Grupo", drawing: "Desenho", record: "Registro" }

function Swatches({ options, value, onChange, label }: { options: Record<string, string>; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {Object.entries(options).map(([key, color]) => (
        <button
          key={key}
          role="radio"
          aria-checked={value === key}
          aria-label={key}
          title={key}
          onClick={() => onChange(key)}
          className={cn("size-6 rounded-full border transition-transform hover:scale-110", value === key ? "ring-2 ring-cobalt ring-offset-1" : "", color === "transparent" ? "border-dashed border-line-strong" : "border-black/10")}
          style={{ background: color === "transparent" ? "white" : color }}
        />
      ))}
    </div>
  )
}

/** Propriedades do que está selecionado: aparência, camada e — para registros — ações explícitas. */
export function PropertiesPanel(props: {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  onUpdateData: (id: string, patch: Record<string, unknown>) => void
  onUpdateEdge: (id: string, patch: Partial<EdgeData>) => void
  onReorder: (dir: "front" | "back" | "forward" | "backward") => void
  onDuplicate: () => void
  onDelete: () => void
  onRelink: (id: string) => void
}) {
  const { nodes, edges } = props
  if (nodes.length === 0 && edges.length === 0) return null
  const single = nodes.length === 1 && edges.length === 0 ? nodes[0]! : null
  const edge = edges.length === 1 && nodes.length === 0 ? edges[0]! : null
  const iconBtn = "flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-paper hover:text-ink [&_svg]:size-4"

  return (
    <div className="w-60 rounded-md border border-line bg-white p-3 shadow-float" aria-label="Propriedades">
      <p className="eyebrow mb-2">{single ? KIND_LABEL[single.data.kind] : edge ? "Conexão" : `${nodes.length + edges.length} selecionados`}</p>

      {single ? <NodeProps node={single} onUpdate={(patch) => props.onUpdateData(single.id, patch)} onRelink={() => props.onRelink(single.id)} /> : null}
      {edge ? <EdgeProps edge={edge} onUpdate={(patch) => props.onUpdateEdge(edge.id, patch)} /> : null}

      <div className="mt-3 flex items-center gap-0.5 border-t border-line-soft pt-2">
        {nodes.length ? (
          <>
            <button className={iconBtn} onClick={() => props.onReorder("front")} aria-label="Trazer para frente" title="Trazer para frente">
              <BringToFront />
            </button>
            <button className={iconBtn} onClick={() => props.onReorder("back")} aria-label="Enviar para trás" title="Enviar para trás">
              <SendToBack />
            </button>
            <button className={iconBtn} onClick={props.onDuplicate} aria-label="Duplicar (Ctrl D)" title="Duplicar — Ctrl D">
              <Copy />
            </button>
          </>
        ) : null}
        <button className={cn(iconBtn, "ml-auto hover:bg-clay-soft hover:text-clay")} onClick={props.onDelete} aria-label="Remover do quadro (Delete)" title="Remover do quadro — Delete">
          <Trash2 />
        </button>
      </div>
      {nodes.some((n) => n.data.kind === "record") ? <p className="mt-2 text-[11px] leading-snug text-ink-4">Remover do quadro não exclui o registro original.</p> : null}
    </div>
  )
}

function NodeProps({ node, onUpdate, onRelink }: { node: CanvasNode; onUpdate: (patch: Record<string, unknown>) => void; onRelink: () => void }) {
  const d = node.data.data
  const value = (k: string, f: string) => (typeof d[k] === "string" ? (d[k] as string) : f)
  switch (node.data.kind) {
    case "card":
      return <Swatches label="Cor de destaque" options={PALETTE.accent} value={value("color", "none")} onChange={(color) => onUpdate({ color })} />
    case "sticky":
      return <Swatches label="Cor" options={PALETTE.sticky} value={value("color", "yellow")} onChange={(color) => onUpdate({ color })} />
    case "frame":
      return <Swatches label="Cor do grupo" options={PALETTE.frame} value={value("color", "paper")} onChange={(color) => onUpdate({ color })} />
    case "drawing":
      return <Swatches label="Cor do traço" options={PALETTE.stroke} value={value("color", "ink")} onChange={(color) => onUpdate({ color })} />
    case "shape":
      return (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Forma">
            {[
              ["rect", "Retângulo"],
              ["ellipse", "Elipse"],
              ["diamond", "Losango"],
            ].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={value("shape", "rect") === k} onClick={() => onUpdate({ shape: k })} className={cn("h-7 flex-1 rounded-xs text-[11px]", value("shape", "rect") === k ? "bg-ink text-paper" : "border border-line text-ink-3")}>
                {l}
              </button>
            ))}
          </div>
          <Swatches label="Preenchimento" options={PALETTE.fill} value={value("color", "white")} onChange={(color) => onUpdate({ color })} />
        </div>
      )
    case "text":
      return (
        <div className="flex gap-1" role="radiogroup" aria-label="Tamanho">
          {["s", "m", "l", "xl"].map((s) => (
            <button key={s} role="radio" aria-checked={value("size", "m") === s} onClick={() => onUpdate({ size: s })} className={cn("h-7 flex-1 rounded-xs font-mono text-[11px] uppercase", value("size", "m") === s ? "bg-ink text-paper" : "border border-line text-ink-3")}>
              {s}
            </button>
          ))}
        </div>
      )
    case "record":
      return <RecordProps node={node} onRelink={onRelink} />
  }
}

function RecordProps({ node, onRelink }: { node: CanvasNode; onRelink: () => void }) {
  const refs = useRefs()
  const ref = node.data.ref!
  const summary = refs.get(ref)
  const missing = refs.isMissing(ref)
  const [pending, start] = useTransition()
  const isDone = summary?.statusTone === "done"
  return (
    <div className="flex flex-col gap-1.5">
      {summary && !missing ? (
        <Link href={summary.href} className="inline-flex items-center gap-1.5 text-sm text-cobalt-ink hover:underline">
          Abrir {REF_LABEL[ref.type].toLowerCase()} <ArrowUpRight className="size-3.5" />
        </Link>
      ) : (
        <p className="text-xs text-clay">Registro indisponível.</p>
      )}
      <button onClick={onRelink} className="inline-flex items-center gap-1.5 text-left text-xs text-ink-3 hover:text-ink">
        <Link2 className="size-3.5" /> Vincular a outro registro
      </button>
      {ref.type === "task" && summary && !missing && !summary.archived ? (
        // Ação explícita: mover o elemento nunca muda o status; só este botão muda.
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setTaskStatusAction(ref.id, isDone ? "todo" : "done")
              if (!r.ok) return void toast.error(r.error)
              await refs.refresh()
              toast.success(isDone ? "Tarefa reaberta." : "Tarefa concluída.")
            })
          }
          className="mt-1 inline-flex h-7 items-center justify-center gap-1.5 rounded-sm border border-line text-xs text-ink-2 hover:border-line-strong hover:bg-paper disabled:opacity-50"
        >
          {isDone ? <RotateCcw className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
          {isDone ? "Reabrir tarefa" : "Concluir tarefa"}
        </button>
      ) : null}
    </div>
  )
}

function EdgeProps({ edge, onUpdate }: { edge: CanvasEdge; onUpdate: (patch: Partial<EdgeData>) => void }) {
  const style = edge.data?.style ?? {}
  const setStyle = (patch: Partial<EdgeData["style"]>) => onUpdate({ style: { ...style, ...patch } })
  const toggle = "flex h-7 flex-1 items-center justify-center rounded-xs text-[11px]"
  return (
    <div className="flex flex-col gap-2">
      <input
        key={edge.id + (edge.data?.label ?? "")}
        defaultValue={edge.data?.label ?? ""}
        onBlur={(e) => e.target.value !== (edge.data?.label ?? "") && onUpdate({ label: e.target.value.trim() })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="Rótulo da conexão"
        aria-label="Rótulo da conexão"
        className="field h-8 text-xs"
        maxLength={500}
      />
      <div className="flex gap-1">
        <button aria-pressed={!!style.arrowStart} onClick={() => setStyle({ arrowStart: !style.arrowStart })} className={cn(toggle, style.arrowStart ? "bg-ink text-paper" : "border border-line text-ink-3")}>
          ← Início
        </button>
        <button aria-pressed={style.arrowEnd !== false} onClick={() => setStyle({ arrowEnd: style.arrowEnd === false })} className={cn(toggle, style.arrowEnd !== false ? "bg-ink text-paper" : "border border-line text-ink-3")}>
          Fim →
        </button>
        <button aria-pressed={!!style.dashed} onClick={() => setStyle({ dashed: !style.dashed })} className={cn(toggle, style.dashed ? "bg-ink text-paper" : "border border-line text-ink-3")}>
          Tracejada
        </button>
      </div>
      <Swatches label="Cor" options={PALETTE.stroke} value={style.color ?? ""} onChange={(color) => setStyle({ color })} />
      <p className="text-[11px] leading-snug text-ink-4">Conexões são visuais: não criam dependência entre tarefas.</p>
    </div>
  )
}
