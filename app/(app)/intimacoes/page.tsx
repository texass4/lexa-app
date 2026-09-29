import type { Metadata } from "next"
import { Suspense } from "react"
import { SkeletonTable } from "@/components/ui/skeleton"
import { IntimacoesView } from "@/components/intimacoes/intimacoes-view"

export const metadata: Metadata = { title: "Intimações" }

export default function IntimacoesPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={6} />}>
      <IntimacoesView />
    </Suspense>
  )
}
