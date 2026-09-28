import type { Metadata } from "next"
import { Suspense } from "react"
import { SkeletonTable } from "@/components/ui/skeleton"
import { UsersView } from "@/components/admin/users/users-view"

export const metadata: Metadata = { title: "Usuários — Admin" }

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<SkeletonTable rows={8} />}>
      <UsersView />
    </Suspense>
  )
}
