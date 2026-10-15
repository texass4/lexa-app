import type { Metadata } from "next"
import { PagesHome } from "@/components/paginas/pages-home"

export const metadata: Metadata = { title: "Páginas" }

export default function PaginasPage() {
  return <PagesHome />
}
