import type { Metadata } from "next"
import { PlansView } from "@/components/admin/plans/plans-view"

export const metadata: Metadata = { title: "Planos — Admin" }

export default function AdminPlansPage() {
  return <PlansView />
}
