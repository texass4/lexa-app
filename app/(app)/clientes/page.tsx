import type { Metadata } from "next"
import { ClientsView } from "@/components/clientes/clients-view"

export const metadata: Metadata = { title: "Clientes" }

export default function ClientesPage() {
  return <ClientsView />
}
