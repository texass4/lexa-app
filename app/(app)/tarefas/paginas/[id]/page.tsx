import type { Metadata } from "next"
import { PageView } from "@/components/paginas/page-view"

// O conteúdo vem do banco no navegador, pela RLS de quem está logado.
export const metadata: Metadata = { title: "Página" }

export default async function PaginaPage({ params }: PageProps<"/tarefas/paginas/[id]">) {
  const { id } = await params
  return <PageView id={id} />
}
