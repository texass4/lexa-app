import type { Metadata } from "next"
import { AdminDashboardView } from "@/components/admin/dashboard/dashboard-view"

export const metadata: Metadata = { title: "Dashboard · Lexa Admin" }

export default function AdminPage() {
  return <AdminDashboardView />
}
