import { apiHandler, readJson } from "@/lib/api"
import { saveEntry } from "@/lib/services/journal"

/** Salvamento automático da entrada do diário de uma data (cria no primeiro salvamento). */
export async function PUT(request: Request, { params }: { params: Promise<{ date: string }> }) {
  return apiHandler(async () => {
    const { date } = await params
    const result = await saveEntry(date, (await readJson(request)) as never)
    return result.ok ? result : Response.json(result, { status: 409 })
  })
}
