import type { Metadata } from "next"
import { Suspense } from "react"
import { JurisprudenceView } from "@/components/jurisprudencia/jurisprudence-view"

export const metadata: Metadata = { title: "Jurisprudência" }

export default function JurisprudenciaPage() {
  // `?q=`, `?id=` e `?processo=` (useSearchParams).
  return (
    <Suspense>
      <JurisprudenceView />
    </Suspense>
  )
}
