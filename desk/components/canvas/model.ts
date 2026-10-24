import type { Edge, Node, Viewport } from "@xyflow/react"
import type { Ref } from "@/lib/domain/refs"
import type { BoardConnectionDto, BoardElementDto, BoardElementKind } from "@/lib/services/boards"
import type { BoardSnapshotInput } from "@/lib/validation"

/*
 * Três coisas separadas no canvas:
 * 1. o registro real (tarefa, página…) — nunca copiado; o elemento guarda só `ref`;
 * 2. a aparência e a geometria do elemento (`data`, posição, tamanho, camada);
 * 3. as conexões desenhadas — relações visuais, sem efeito sobre os dados.
 */

export type ElementData = { kind: BoardElementKind; data: Record<string, unknown>; ref: Ref | null }
export type CanvasNode = Node<ElementData, BoardElementKind>
export type EdgeStyle = { arrowStart?: boolean; arrowEnd?: boolean; dashed?: boolean; color?: string }
export type EdgeData = { label: string; style: EdgeStyle }
export type CanvasEdge = Edge<EdgeData, "labeled">

export const DEFAULT_SIZE: Record<BoardElementKind, { width: number; height: number }> = {
  card: { width: 240, height: 120 },
  shape: { width: 160, height: 100 },
  text: { width: 220, height: 44 },
  sticky: { width: 180, height: 160 },
  frame: { width: 560, height: 360 },
  drawing: { width: 100, height: 100 },
  record: { width: 272, height: 118 },
}

export const PALETTE = {
  sticky: { yellow: "#F7E7A1", sage: "#DCE6D2", cobalt: "#DDE3FF", clay: "#F5D9CC", plum: "#EBDDEF", paper: "#ECE9DF" },
  fill: { white: "#FFFFFF", paper: "#F2F0E9", sage: "#E3E9DD", cobalt: "#E5E9FF", clay: "#F6E2D9", ink: "#171A21" },
  accent: { none: "transparent", cobalt: "#5269FF", sage: "#8E9E84", clay: "#C2532F", amber: "#A8701C", plum: "#7A4F86", ink: "#171A21" },
  frame: { paper: "#E9E6DC", sage: "#E3E9DD", cobalt: "#EEF0FF", clay: "#F6E9E2" },
  stroke: { ink: "#171A21", cobalt: "#5269FF", clay: "#C2532F", sage: "#5E6B55" },
} as const

/** Frames ficam sempre atrás; os demais elementos seguem a ordem de camada salva. */
const FRAME_LAYER = -1000

export function toNode(e: BoardElementDto): CanvasNode {
  return {
    id: e.id,
    type: e.kind,
    position: { x: e.x, y: e.y },
    width: e.width,
    height: e.height,
    zIndex: e.kind === "frame" ? FRAME_LAYER + e.zIndex : e.zIndex,
    parentId: e.parentId ?? undefined,
    data: { kind: e.kind, data: e.data, ref: e.ref },
    dragHandle: e.kind === "frame" ? ".frame-handle" : undefined,
  }
}

export function toEdge(c: BoardConnectionDto): CanvasEdge {
  return {
    id: c.id,
    source: c.sourceId,
    target: c.targetId,
    sourceHandle: c.sourceHandle,
    targetHandle: c.targetHandle,
    type: "labeled",
    data: { label: c.label, style: c.style ?? {} },
  }
}

/** React Flow exige o frame (pai) antes dos filhos na lista. */
export function sortNodes(nodes: CanvasNode[]): CanvasNode[] {
  return [...nodes].sort((a, b) => (a.type === "frame" ? 0 : 1) - (b.type === "frame" ? 0 : 1))
}

const round = (n: number) => Math.round(n * 100) / 100

/** Retrato do quadro para salvar: só geometria, aparência, referências e conexões. */
export function toSnapshot(nodes: CanvasNode[], edges: CanvasEdge[], viewport: Viewport): Omit<BoardSnapshotInput, "baseVersion"> {
  const ids = new Set(nodes.map((n) => n.id))
  return {
    viewport: { x: round(viewport.x), y: round(viewport.y), zoom: round(viewport.zoom * 1000) / 1000 },
    elements: nodes.map((n) => {
      const kind = n.data.kind
      const size = DEFAULT_SIZE[kind]
      return {
        id: n.id,
        kind,
        x: round(n.position.x),
        y: round(n.position.y),
        width: round(Math.max(4, n.width ?? n.measured?.width ?? size.width)),
        height: round(Math.max(4, n.height ?? n.measured?.height ?? size.height)),
        zIndex: kind === "frame" ? (n.zIndex ?? FRAME_LAYER) - FRAME_LAYER : (n.zIndex ?? 0),
        parentId: n.parentId && ids.has(n.parentId) ? n.parentId : null,
        data: n.data.data,
        ref: kind === "record" ? n.data.ref : null,
      } as BoardSnapshotInput["elements"][number]
    }),
    connections: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        sourceId: e.source,
        targetId: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
        label: e.data?.label ?? "",
        style: e.data?.style ?? {},
      })),
  }
}

export const newId = () => crypto.randomUUID()
