import { notFound } from "next/navigation"
import { BoardCanvas } from "@/components/canvas/board-canvas"
import { getRequestContext } from "@/lib/context"
import { UUID_RE, type Ref } from "@/lib/domain/refs"
import { getBoard } from "@/lib/services/boards"
import { resolveRefs } from "@/lib/services/refs"

export async function generateMetadata({ params }: PageProps<"/canvas/[id]">) {
  const { id } = await params
  const board = UUID_RE.test(id) ? await getBoard(id) : null
  return { title: board?.title || "Quadro" }
}

export default async function BoardPage({ params }: PageProps<"/canvas/[id]">) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const [board, ctx] = await Promise.all([getBoard(id), getRequestContext()])
  if (!board) notFound()
  // Estado atual dos registros vinculados (o elemento guarda só tipo + id).
  const refs = await resolveRefs(board.elements.filter((e) => e.ref).map((e) => e.ref as Ref), ctx.today)
  return (
    <div className="h-[calc(100dvh-3rem)] md:h-dvh">
      <BoardCanvas key={board.id} board={board} initialRefs={refs} />
    </div>
  )
}
