import type { Metadata } from "next"
import { FinanceView } from "@/components/financeiro/finance-view"

export const metadata: Metadata = { title: "Financeiro" }

export default function FinanceiroPage() {
  return <FinanceView />
}
