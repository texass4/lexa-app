import type { Metadata } from "next"
import { Suspense } from "react"
import { SkeletonTable } from "@/components/ui/skeleton"
import { AuditView } from "@/components/admin/audit/audit-view"

export const metadata: Metadata = { title: "Atividade — Admin" }

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={10} />}>
      <AuditView />
    </Suspense>
  )
}
