import type { Metadata } from "next"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { OrganizationDetailView } from "@/components/admin/organizations/organization-detail-view"

export const metadata: Metadata = { title: "Escritório — Admin" }

export default async function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-[14px]" />}>
      <OrganizationDetailView id={id} />
    </Suspense>
  )
}
