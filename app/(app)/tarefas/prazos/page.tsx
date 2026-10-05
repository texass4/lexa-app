import { Suspense } from "react"
import type { Metadata } from "next"
import { PrazosView } from "@/components/prazos/prazos-view"

export const metadata: Metadata = { title: "Prazos" }

export default function PrazosPage() {
  return (
    <Suspense>
      <PrazosView />
    </Suspense>
  )
}
