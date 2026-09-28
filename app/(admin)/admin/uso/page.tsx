import type { Metadata } from "next"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { UsageView } from "@/components/admin/usage/usage-view"

export const metadata: Metadata = { title: "Uso da plataforma — Admin" }

export default function AdminUsagePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-[14px]" />}>
      <UsageView />
    </Suspense>
  )
}
