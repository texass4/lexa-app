import type { Metadata } from "next"
import { Suspense } from "react"
import { SkeletonTable } from "@/components/ui/skeleton"
import { TriagemView } from "@/components/triagem/triagem-view"

export const metadata: Metadata = { title: "Triagem" }

export default function TriagemPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={6} />}>
      <TriagemView />
    </Suspense>
  )
}
