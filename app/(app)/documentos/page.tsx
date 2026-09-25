import type { Metadata } from "next"
import { DocumentsView } from "@/components/documentos/documents-view"

export const metadata: Metadata = { title: "Documentos" }

export default function DocumentosPage() {
  return <DocumentsView />
}
