import type { Metadata } from "next"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { FinanceView } from "@/components/admin/finance/finance-view"

export const metadata: Metadata = { title: "Financeiro — Admin" }

export default function AdminFinancePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-[14px]" />}>
      <FinanceView />
    </Suspense>
  )
}
