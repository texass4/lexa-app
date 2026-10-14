import type { Metadata } from "next"
import { Suspense } from "react"
import { FinanceView } from "@/components/financeiro/finance-view"

export const metadata: Metadata = { title: "Financeiro" }

export default function FinanceiroPage() {
  // `?aba=` escolhe a aba aberta (useSearchParams).
  return (
    <Suspense>
      <FinanceView />
    </Suspense>
  )
}
