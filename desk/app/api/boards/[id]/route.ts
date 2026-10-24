import { apiHandler, readJson } from "@/lib/api"
import { UUID_RE } from "@/lib/domain/refs"
import { getBoard, saveBoardSnapshot } from "@/lib/services/boards"
import { invalid, notFound } from "@/lib/services/errors"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiHandler(async () => {
    const { id } = await params
    if (!UUID_RE.test(id)) throw invalid("Quadro inválido.")
    const board = await getBoard(id)
    if (!board) throw notFound("Quadro")
    return board
  })
}

/** Salvamento automático do quadro: elementos, conexões e câmera, com controle de versão. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiHandler(async () => {
    const { id } = await params
    if (!UUID_RE.test(id)) throw invalid("Quadro inválido.")
    const result = await saveBoardSnapshot(id, (await readJson(request, 8_000_000)) as never)
    return result.ok ? result : Response.json(result, { status: 409 })
  })
}
