import type { Metadata } from "next"
import { ProcessesView } from "@/components/processos/processes-view"

export const metadata: Metadata = { title: "Processos" }

export default function ProcessosPage() {
  return <ProcessesView />
}
