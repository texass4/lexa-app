import { Suspense } from "react"
import type { Metadata } from "next"
import { SettingsView } from "@/components/configuracoes/settings-view"

export const metadata: Metadata = { title: "Configurações" }

export default function ConfiguracoesPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  )
}
