import { Suspense } from "react"
import type { Metadata } from "next"
import { AtendimentoView } from "@/components/atendimento/atendimento-view"

export const metadata: Metadata = { title: "Atendimento" }

export default function AtendimentoPage() {
  return (
    <Suspense>
      <AtendimentoView />
    </Suspense>
  )
}
