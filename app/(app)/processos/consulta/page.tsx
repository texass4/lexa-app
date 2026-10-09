import { Suspense } from "react"
import type { Metadata } from "next"
import { ConsultaView } from "@/components/processos/consulta/consulta-view"

export const metadata: Metadata = { title: "Consulta processual" }

export default function ConsultaPage() {
  return (
    <Suspense>
      <ConsultaView />
    </Suspense>
  )
}
