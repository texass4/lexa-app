import type { Metadata } from "next"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { AIUsageView } from "@/components/admin/usage/ai-usage-view"

export const metadata: Metadata = { title: "Consumo de IA — Admin" }

export default function AdminAIUsagePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-[14px]" />}>
      <AIUsageView />
    </Suspense>
  )
}
