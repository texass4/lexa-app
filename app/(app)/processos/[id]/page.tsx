import type { Metadata } from "next"
import { ProcessProfile } from "@/components/processos/process-profile"

// Os processos ficam salvos no navegador — o servidor não os conhece.
export const metadata: Metadata = { title: "Processo" }

export default async function ProcessoPage({ params }: PageProps<"/processos/[id]">) {
  const { id } = await params
  return <ProcessProfile id={id} />
}
