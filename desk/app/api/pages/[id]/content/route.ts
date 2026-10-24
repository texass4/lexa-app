import { apiHandler, readJson } from "@/lib/api"
import { UUID_RE } from "@/lib/domain/refs"
import { invalid } from "@/lib/services/errors"
import { savePageContent } from "@/lib/services/pages"

/** Salvamento automático do conteúdo da página (com controle de versão). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiHandler(async () => {
    const { id } = await params
    if (!UUID_RE.test(id)) throw invalid("Página inválida.")
    const result = await savePageContent(id, (await readJson(request)) as never)
    return result.ok ? result : Response.json(result, { status: 409 })
  })
}
