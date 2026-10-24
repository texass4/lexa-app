import { apiHandler } from "@/lib/api"
import { exportJson } from "@/lib/services/export"

export async function GET() {
  return apiHandler(async () => {
    const data = await exportJson()
    const stamp = data.exportedAt.slice(0, 10)
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="mesa-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    })
  })
}
