import type { Metadata } from "next"
import { MonitoringView } from "@/components/admin/monitoring/monitoring-view"

export const metadata: Metadata = { title: "Monitoramento de processos — Admin" }

export default function AdminMonitoringPage() {
  return <MonitoringView />
}
