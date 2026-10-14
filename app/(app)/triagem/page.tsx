import { redirect } from "next/navigation"

/**
 * A Triagem saiu do produto. Atividades antigas ainda apontam para cá
 * (`/triagem?id=…`, `0012_triagem.sql`): o link leva a Processos em vez de quebrar.
 */
export default function TriagemPage() {
  redirect("/processos")
}
