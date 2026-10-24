import { apiHandler } from "@/lib/api"
import { exportMarkdownZip } from "@/lib/services/export"

export async function GET() {
  return apiHandler(async () => {
    const zip = await exportMarkdownZip()
    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), {
      headers: {
        "Content-Disposition": `attachment; filename="mesa-markdown-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    })
  })
}
