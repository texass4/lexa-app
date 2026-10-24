"use client"

import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type OnBeforeDelete,
  type Viewport,
  type XYPosition,
} from "@xyflow/react"
import { AlertTriangle, History } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { RefsProvider, useRefs } from "@/components/editor/refs-context"
import { Button } from "@/components/ui/button"
import { putJson, useAutosave } from "@/lib/client/autosave"
import { cn } from "@/lib/cn"
import { hrefFor, type Ref, type RefSummary } from "@/lib/domain/refs"
import type { BoardDetail, BoardElementKind } from "@/lib/services/boards"
import type { BoardSnapshotInput } from "@/lib/validation"
import { BoardTopBar } from "./board-top-bar"
import { CanvasContext } from "./canvas-context"
import { EDGE_TYPES } from "./edge"
import { EdgeContext } from "./edge-context"
import { DEFAULT_SIZE, newId, sortNodes, toEdge, toNode, toSnapshot, type CanvasEdge, type CanvasNode, type EdgeData } from "./model"
import { NODE_TYPES } from "./nodes"
import { PenOverlay } from "./pen-overlay"
import { PropertiesPanel } from "./properties-panel"
import { RecordPicker } from "./record-picker"
import { Toolbar, type ShapeKind, type Tool } from "./toolbar"

type Snap = { nodes: CanvasNode[]; edges: CanvasEdge[] }
type Snapshot = Omit<BoardSnapshotInput, "baseVersion">

export function BoardCanvas({ board, initialRefs }: { board: BoardDetail; initialRefs: Record<string, RefSummary> }) {
  return (
    <RefsProvider initial={initialRefs}>
      <ReactFlowProvider>
        <Canvas board={board} />
      </ReactFlowProvider>
    </RefsProvider>
  )
}

const CREATION_TOOLS: Tool[] = ["card", "shape", "text", "sticky", "frame"]
const strip = <T extends { selected?: boolean; dragging?: boolean }>(item: T): T => ({ ...item, selected: false, dragging: false })

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
}

function Canvas({ board }: { board: BoardDetail }) {
  const rf = useReactFlow<CanvasNode, CanvasEdge>()
  const router = useRouter()
  const refs = useRefs()
  const initialNodes = useMemo(() => sortNodes(board.elements.map(toNode)), [board.elements])
  const initialEdges = useMemo(() => board.connections.map(toEdge), [board.connections])
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(initialEdges)
  const [tool, setTool] = useState<Tool>("select")
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rect")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ mode: "insert"; at?: XYPosition } | { mode: "relink"; id: string } | null>(null)
  const viewport = useRef<Viewport>(board.viewport)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [nodes, edges])

  // ——— Desfazer / refazer ————————————————————————————————————————————————
  const past = useRef<Snap[]>([])
  const future = useRef<Snap[]>([])
  const [history, setHistory] = useState({ past: 0, future: 0 })
  const syncHistory = useCallback(() => setHistory({ past: past.current.length, future: future.current.length }), [])
  const snap = useCallback((): Snap => ({ nodes: nodesRef.current.map(strip), edges: edgesRef.current.map(strip) }), [])
  const checkpoint = useCallback(() => {
    past.current.push(snap())
    if (past.current.length > 100) past.current.shift()
    future.current = []
    syncHistory()
  }, [snap, syncHistory])
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(snap())
    setNodes(prev.nodes)
    setEdges(prev.edges)
    syncHistory()
  }, [snap, setNodes, setEdges, syncHistory])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(snap())
    setNodes(next.nodes)
    setEdges(next.edges)
    syncHistory()
  }, [snap, setNodes, setEdges, syncHistory])

  // ——— Salvamento automático ————————————————————————————————————————————————
  const save = useCallback(
    (snapshot: Snapshot, baseVersion: number, opts: { keepalive?: boolean; force?: boolean }) => putJson(`/api/boards/${board.id}`, { ...snapshot, baseVersion, force: opts.force }, { keepalive: opts.keepalive }),
    [board.id],
  )
  const initialSnapshot = useMemo(() => toSnapshot(initialNodes, initialEdges, board.viewport), [initialNodes, initialEdges, board.viewport])
  const autosave = useAutosave<Snapshot>({ key: `board:${board.id}`, initialVersion: board.version, save, delay: 700, serverValue: initialSnapshot })
  const lastSerialized = useRef(JSON.stringify(initialSnapshot))
  const { schedule } = autosave
  const queueSave = useCallback(() => {
    const snapshot = toSnapshot(nodesRef.current, edgesRef.current, viewport.current)
    const serialized = JSON.stringify(snapshot)
    if (serialized === lastSerialized.current) return
    lastSerialized.current = serialized
    schedule(snapshot)
  }, [schedule])
  // Seleção não conta como alteração; arrastar/redimensionar salva ao soltar.
  useEffect(() => {
    if (nodes.some((n) => n.dragging || n.resizing)) return
    queueSave()
  }, [nodes, edges, queueSave])

  const applySnapshot = useCallback(
    (s: { elements: BoardDetail["elements"]; connections: BoardDetail["connections"]; viewport?: Viewport }) => {
      setNodes(sortNodes(s.elements.map(toNode)))
      setEdges(s.connections.map(toEdge))
      if (s.viewport) {
        viewport.current = s.viewport
        void rf.setViewport(s.viewport)
      }
    },
    [rf, setNodes, setEdges],
  )

  const restoreDraft = () => {
    const draft = autosave.draft
    if (!draft) return
    checkpoint()
    applySnapshot({ elements: draft.value.elements as BoardDetail["elements"], connections: draft.value.connections, viewport: draft.value.viewport })
    autosave.discardDraft()
    toast.success("Alterações não salvas recuperadas.")
  }

  const keepServer = async () => {
    try {
      const res = await fetch(`/api/boards/${board.id}`)
      if (!res.ok) throw new Error()
      const fresh = (await res.json()) as BoardDetail
      autosave.resolveConflict("theirs")
      autosave.setVersion(fresh.version)
      applySnapshot(fresh)
      lastSerialized.current = JSON.stringify(toSnapshot(sortNodes(fresh.elements.map(toNode)), fresh.connections.map(toEdge), fresh.viewport))
    } catch {
      toast.error("Não foi possível carregar a versão salva.")
    }
  }

  // ——— Registros vinculados: sempre o estado atual ————————————————————————————
  useEffect(() => {
    refs.track(nodes.filter((n) => n.data.ref).map((n) => n.data.ref!))
  }, [nodes, refs])
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void refs.refresh(), 30_000)
    return () => clearInterval(t)
  }, [refs])

  // ——— Frames (agrupamento) ———————————————————————————————————————————————————
  const absolute = useCallback(
    (node: CanvasNode): XYPosition => {
      const internal = rf.getInternalNode(node.id)
      return internal?.internals.positionAbsolute ?? node.position
    },
    [rf],
  )
  const frameAt = useCallback(
    (point: XYPosition, exclude?: string): CanvasNode | undefined => {
      const frames = nodesRef.current.filter((n) => n.type === "frame" && n.id !== exclude)
      return frames.reverse().find((f) => {
        const p = absolute(f)
        const w = f.width ?? f.measured?.width ?? 0
        const h = f.height ?? f.measured?.height ?? 0
        return point.x >= p.x && point.x <= p.x + w && point.y >= p.y && point.y <= p.y + h
      })
    },
    [absolute],
  )

  /** Ao soltar, o elemento entra no frame sob o seu centro (ou sai dele). */
  const reparent = useCallback(
    (moved: CanvasNode[]) => {
      const updates = new Map<string, { parentId?: string; position: XYPosition }>()
      for (const node of moved) {
        if (node.type === "frame") continue
        const abs = absolute(node)
        const w = node.width ?? node.measured?.width ?? 0
        const h = node.height ?? node.measured?.height ?? 0
        const frame = frameAt({ x: abs.x + w / 2, y: abs.y + h / 2 })
        if ((frame?.id ?? undefined) === (node.parentId ?? undefined)) continue
        if (frame) {
          const fp = absolute(frame)
          updates.set(node.id, { parentId: frame.id, position: { x: abs.x - fp.x, y: abs.y - fp.y } })
        } else updates.set(node.id, { parentId: undefined, position: abs })
      }
      if (updates.size === 0) return
      setNodes((ns) => sortNodes(ns.map((n) => (updates.has(n.id) ? { ...n, ...updates.get(n.id)! } : n))))
    },
    [absolute, frameAt, setNodes],
  )

  // Excluir um frame não apaga o que está dentro: os filhos saem do grupo e ficam no quadro.
  const onBeforeDelete: OnBeforeDelete<CanvasNode, CanvasEdge> = useCallback(
    async ({ nodes: toDelete, edges: edgesToDelete }) => {
      checkpoint()
      const explicit = new Set(nodesRef.current.filter((n) => n.selected).map((n) => n.id))
      const frames = new Set(toDelete.filter((n) => n.type === "frame").map((n) => n.id))
      const keep = toDelete.filter((n) => !explicit.has(n.id) && n.parentId && frames.has(n.parentId))
      if (keep.length) {
        const positions = new Map(keep.map((n) => [n.id, absolute(n)]))
        setNodes((ns) => ns.map((n) => (positions.has(n.id) ? { ...n, parentId: undefined, position: positions.get(n.id)! } : n)))
      }
      const keepIds = new Set(keep.map((n) => n.id))
      return { nodes: toDelete.filter((n) => !keepIds.has(n.id)), edges: edgesToDelete.filter((e) => !keepIds.has(e.source) && !keepIds.has(e.target)) }
    },
    [absolute, checkpoint, setNodes],
  )

  // ——— Criação de elementos ————————————————————————————————————————————————
  const addNode = useCallback(
    (kind: BoardElementKind, center: XYPosition, data: Record<string, unknown>, ref: CanvasNode["data"]["ref"] = null, size = DEFAULT_SIZE[kind]) => {
      checkpoint()
      const id = newId()
      let position = { x: center.x - size.width / 2, y: center.y - size.height / 2 }
      let parentId: string | undefined
      if (kind !== "frame") {
        const frame = frameAt(center)
        if (frame) {
          const fp = absolute(frame)
          parentId = frame.id
          position = { x: position.x - fp.x, y: position.y - fp.y }
        }
      }
      const maxZ = Math.max(0, ...nodesRef.current.filter((n) => n.type !== "frame").map((n) => n.zIndex ?? 0))
      const node: CanvasNode = {
        ...toNode({ id, kind, x: position.x, y: position.y, width: size.width, height: size.height, zIndex: kind === "frame" ? 0 : maxZ + 1, parentId: parentId ?? null, data, ref }),
        selected: true,
      }
      setNodes((ns) => sortNodes([...ns.map((n) => ({ ...n, selected: false })), node]))
      const field = kind === "card" || kind === "frame" ? "title" : kind === "drawing" || kind === "record" ? null : "text"
      if (field) setEditingId(`${id}:${field}`)
      return id
    },
    [absolute, checkpoint, frameAt, setNodes],
  )

  const createAt = useCallback(
    (t: Tool, point: XYPosition) => {
      if (t === "card") addNode("card", point, { title: "", body: "" })
      else if (t === "shape") addNode("shape", point, { shape: shapeKind, text: "", color: "white" })
      else if (t === "text") addNode("text", point, { text: "", size: "m" })
      else if (t === "sticky") addNode("sticky", point, { text: "", color: "yellow" })
      else if (t === "frame") addNode("frame", point, { title: "Grupo", color: "paper" })
    },
    [addNode, shapeKind],
  )

  const viewportCenter = useCallback((): XYPosition => {
    const el = document.querySelector(".mesa-flow")?.getBoundingClientRect()
    return rf.screenToFlowPosition({ x: (el?.left ?? 0) + (el?.width ?? window.innerWidth) / 2, y: (el?.top ?? 0) + (el?.height ?? window.innerHeight) / 2 })
  }, [rf])

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (tool === "record") return setPicker({ mode: "insert", at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) })
      if (!CREATION_TOOLS.includes(tool)) return
      createAt(tool, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
      setTool("select")
    },
    [createAt, rf, tool],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return
      checkpoint()
      setEdges((es) => addEdge<CanvasEdge>({ ...connection, id: newId(), type: "labeled", data: { label: "", style: { arrowEnd: true } } }, es))
    },
    [checkpoint, setEdges],
  )

  // ——— Ações sobre elementos ————————————————————————————————————————————————
  const updateData = useCallback(
    (id: string, patch: Record<string, unknown>, opts: { checkpoint?: boolean } = {}) => {
      if (opts.checkpoint) checkpoint()
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, data: { ...n.data.data, ...patch } } } : n)))
    },
    [checkpoint, setNodes],
  )
  const updateEdge = useCallback(
    (id: string, patch: Partial<EdgeData>) => {
      checkpoint()
      setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { label: e.data?.label ?? "", style: e.data?.style ?? {}, ...patch } } : e)))
    },
    [checkpoint, setEdges],
  )
  const removeElement = useCallback((id: string) => void rf.deleteElements({ nodes: [{ id }] }), [rf])

  const duplicate = useCallback(() => {
    const selected = nodesRef.current.filter((n) => n.selected)
    if (!selected.length) return
    checkpoint()
    const map = new Map(selected.map((n) => [n.id, newId()]))
    const copies = selected.map((n) => ({
      ...n,
      id: map.get(n.id)!,
      selected: true,
      position: { x: n.position.x + 28, y: n.position.y + 28 },
      parentId: n.parentId && map.has(n.parentId) ? map.get(n.parentId) : n.parentId,
      data: structuredClone(n.data),
    }))
    const edgeCopies = edgesRef.current
      .filter((e) => map.has(e.source) && map.has(e.target))
      .map((e) => ({ ...e, id: newId(), source: map.get(e.source)!, target: map.get(e.target)!, selected: false, data: structuredClone(e.data) }))
    setNodes((ns) => sortNodes([...ns.map((n) => ({ ...n, selected: false })), ...copies]))
    setEdges((es) => [...es, ...edgeCopies])
  }, [checkpoint, setEdges, setNodes])

  const reorder = useCallback(
    (dir: "front" | "back" | "forward" | "backward") => {
      const ids = new Set(nodesRef.current.filter((n) => n.selected && n.type !== "frame").map((n) => n.id))
      if (!ids.size) return
      checkpoint()
      setNodes((ns) => {
        const zs = ns.filter((n) => n.type !== "frame").map((n) => n.zIndex ?? 0)
        const max = Math.max(0, ...zs)
        const min = Math.min(0, ...zs)
        return ns.map((n) => {
          if (!ids.has(n.id)) return n
          const z = n.zIndex ?? 0
          return { ...n, zIndex: dir === "front" ? max + 1 : dir === "back" ? min - 1 : dir === "forward" ? z + 1 : z - 1 }
        })
      })
    },
    [checkpoint, setNodes],
  )

  const pickRecord = (picked: Ref & { title: string }) => {
    const current = picker
    setPicker(null)
    refs.put({ type: picked.type, id: picked.id, title: picked.title, href: hrefFor(picked.type, picked.id) })
    void refs.refresh()
    if (current?.mode === "relink") {
      checkpoint()
      setNodes((ns) => ns.map((n) => (n.id === current.id ? { ...n, data: { ...n.data, ref: { type: picked.type, id: picked.id } } } : n)))
    } else {
      addNode("record", current?.at ?? viewportCenter(), {}, { type: picked.type, id: picked.id })
      setTool("select")
    }
  }

  const finishDrawing = useCallback(
    (points: XYPosition[], color: string) => {
      if (points.length < 2) return
      const xs = points.map((p) => p.x)
      const ys = points.map((p) => p.y)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const width = Math.max(8, Math.max(...xs) - minX)
      const height = Math.max(8, Math.max(...ys) - minY)
      const rel = points.map((p) => [Math.round((p.x - minX) * 10) / 10, Math.round((p.y - minY) * 10) / 10] as [number, number])
      addNode("drawing", { x: minX + width / 2, y: minY + height / 2 }, { points: rel, color, strokeWidth: 2.5 }, null, { width, height })
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })))
    },
    [addNode, setNodes],
  )

  // ——— Atalhos de teclado do quadro ————————————————————————————————————————
  useEffect(() => {
    const keys: Record<string, Tool> = { v: "select", h: "hand", c: "card", r: "shape", t: "text", s: "sticky", f: "frame", p: "pen", l: "record" }
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || document.querySelector("[role=dialog]")) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      let handled = true
      if (mod && key === "z" && !e.shiftKey) undo()
      else if ((mod && key === "z" && e.shiftKey) || (mod && key === "y")) redo()
      else if (mod && key === "d") duplicate()
      else if (mod && key === "a") setNodes((ns) => ns.map((n) => ({ ...n, selected: true })))
      else if (!mod && !e.altKey && keys[key]) {
        if (keys[key] === "record") setPicker({ mode: "insert" })
        else setTool(keys[key]!)
      } else if (key === "escape") {
        setTool("select")
        setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)))
      } else if (e.shiftKey && e.key === "!") void rf.fitView({ padding: 0.2, duration: 200 })
      else handled = false
      if (handled) {
        e.preventDefault()
        // Impede que os atalhos globais (N, C…) também respondam dentro do quadro.
        e.stopPropagation()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [duplicate, redo, rf, setNodes, undo])

  // Primeira abertura de um quadro com elementos mas sem câmera salva: enquadra tudo.
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current) return
    fitted.current = true
    const v = board.viewport
    if (board.elements.length && v.x === 0 && v.y === 0 && v.zoom === 1) setTimeout(() => void rf.fitView({ padding: 0.2 }), 50)
  }, [board.elements.length, board.viewport, rf])

  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdges = edges.filter((e) => e.selected)
  const canvasActions = useMemo(() => ({ updateData, checkpoint, relink: (id: string) => setPicker({ mode: "relink", id }), removeElement, editingId, setEditingId }), [updateData, checkpoint, removeElement, editingId])
  const edgeActions = useMemo(() => ({ updateEdge, editingEdgeId, setEditingEdgeId }), [updateEdge, editingEdgeId])

  return (
    <CanvasContext.Provider value={canvasActions}>
      <EdgeContext.Provider value={edgeActions}>
        <div className={cn("relative h-full w-full", tool !== "select" && tool !== "hand" && "[&_.react-flow__pane]:!cursor-crosshair")}>
          <ReactFlow<CanvasNode, CanvasEdge>
            className="mesa-flow bg-paper"
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onBeforeDelete={onBeforeDelete}
            onPaneClick={onPaneClick}
            onNodeDragStart={() => checkpoint()}
            onNodeDragStop={(_, __, dragged) => {
              reparent(dragged)
              queueSave()
            }}
            onSelectionDragStart={() => checkpoint()}
            onSelectionDragStop={(_, dragged) => {
              reparent(dragged)
              queueSave()
            }}
            onMoveEnd={(_, vp) => {
              viewport.current = vp
              queueSave()
            }}
            onNodeDoubleClick={(_, node) => {
              if (node.type === "record" && node.data.ref) {
                const s = refs.get(node.data.ref)
                if (s) router.push(s.href)
              }
            }}
            defaultViewport={board.viewport}
            connectionMode={ConnectionMode.Loose}
            selectionMode={SelectionMode.Partial}
            selectionOnDrag={tool === "select"}
            panOnDrag={tool === "hand" ? true : [1, 2]}
            panOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            nodesDraggable={tool === "select"}
            elementsSelectable={tool === "select" || tool === "hand"}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            deleteKeyCode={["Backspace", "Delete"]}
            minZoom={0.1}
            maxZoom={4}
            snapToGrid={false}
            elevateNodesOnSelect={false}
            proOptions={{ hideAttribution: true }}
            aria-label="Quadro visual"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="rgb(23 26 33 / 0.18)" />
            <MiniMap pannable zoomable className="!hidden !bg-white md:!block" nodeColor={(n) => (n.type === "frame" ? "#E9E6DC" : n.type === "record" ? "#5269FF" : n.type === "sticky" ? "#F7E7A1" : "#C4BFB1")} maskColor="rgb(242 240 233 / 0.7)" ariaLabel="Minimapa" />
            <Panel position="top-left" className="!m-3 max-w-[calc(100%-1.5rem)]">
              <BoardTopBar board={board} status={autosave.status} onRetry={autosave.retry} />
            </Panel>
            <Panel position="top-right" className="!m-3 !mt-16 md:!mt-3">
              <PropertiesPanel
                nodes={selectedNodes}
                edges={selectedEdges}
                onUpdateData={(id, patch) => updateData(id, patch, { checkpoint: true })}
                onUpdateEdge={updateEdge}
                onReorder={reorder}
                onDuplicate={duplicate}
                onDelete={() => void rf.deleteElements({ nodes: selectedNodes.map((n) => ({ id: n.id })), edges: selectedEdges.map((e) => ({ id: e.id })) })}
                onRelink={(id) => setPicker({ mode: "relink", id })}
              />
            </Panel>
            <Panel position="bottom-center" className="!mb-4 max-w-[calc(100%-1rem)]">
              <Toolbar
                tool={tool}
                onTool={(t) => (t === "record" ? setPicker({ mode: "insert" }) : setTool(t))}
                shape={shapeKind}
                onShape={setShapeKind}
                canUndo={history.past > 0}
                canRedo={history.future > 0}
                onUndo={undo}
                onRedo={redo}
                onZoomIn={() => void rf.zoomIn({ duration: 150 })}
                onZoomOut={() => void rf.zoomOut({ duration: 150 })}
                onFit={() => void rf.fitView({ padding: 0.2, duration: 200 })}
              />
            </Panel>
            {nodes.length === 0 ? (
              <Panel position="top-center" className="!mt-24 pointer-events-none">
                <div className="max-w-sm rounded-md border border-dashed border-line-strong bg-paper/80 px-5 py-4 text-center backdrop-blur">
                  <p className="font-serif text-lg text-ink">Quadro em branco</p>
                  <p className="mt-1 text-sm text-ink-3">Escolha uma ferramenta abaixo e clique no quadro. Use “Registro” para trazer tarefas, projetos e páginas reais.</p>
                </div>
              </Panel>
            ) : null}
          </ReactFlow>
          {tool === "pen" ? <PenOverlay onFinish={finishDrawing} onCancel={() => setTool("select")} /> : null}

          {autosave.draft || autosave.status === "conflict" ? (
            <div className="absolute top-20 left-1/2 z-10 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2">
              {autosave.draft ? (
                <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-amber/40 bg-amber-soft px-4 py-3 text-sm shadow-lift">
                  <History className="size-4 text-amber" />
                  <span className="flex-1">Há alterações deste quadro que não chegaram a ser salvas.</span>
                  <Button size="sm" variant="primary" onClick={restoreDraft}>
                    Recuperar
                  </Button>
                  <Button size="sm" onClick={autosave.discardDraft}>
                    Descartar
                  </Button>
                </div>
              ) : (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-clay/40 bg-clay-soft px-4 py-3 text-sm shadow-lift">
                  <AlertTriangle className="size-4 text-clay" />
                  <span className="flex-1">O quadro foi alterado em outra aba. Qual versão manter?</span>
                  <Button size="sm" variant="primary" onClick={() => autosave.resolveConflict("mine")}>
                    A minha
                  </Button>
                  <Button size="sm" onClick={keepServer}>
                    A salva
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
        <RecordPicker open={picker !== null} onOpenChange={(o) => !o && setPicker(null)} onPick={pickRecord} title={picker?.mode === "relink" ? "Vincular a outro registro" : "Trazer um registro para o quadro"} />
      </EdgeContext.Provider>
    </CanvasContext.Provider>
  )
}
