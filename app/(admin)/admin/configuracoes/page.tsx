import type { Metadata } from "next"
import { SettingsView } from "@/components/admin/settings/settings-view"

export const metadata: Metadata = { title: "Configurações — Admin" }

export default function AdminSettingsPage() {
  return <SettingsView />
}
