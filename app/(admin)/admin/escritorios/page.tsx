import type { Metadata } from "next"
import { Suspense } from "react"
import { SkeletonTable } from "@/components/ui/skeleton"
import { OrganizationsView } from "@/components/admin/organizations/organizations-view"

export const metadata: Metadata = { title: "Escritórios — Admin" }

export default function AdminOrganizationsPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={8} />}>
      <OrganizationsView />
    </Suspense>
  )
}
