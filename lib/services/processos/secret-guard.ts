/**
 * Trava no servidor para as rotas de consulta pelo navegador (`processes/search` e
 * `processes/[id]/sync`): processo marcado como segredo de justiça no cadastro do
 * escritório não vai à fonte pública — mesmo que alguém chame a rota direto, sem a tela.
 *
 * Consulta com a sessão de quem chama (RLS): só enxerga processos do próprio escritório.
 * Responde só sim/não — nenhum dado do processo sai daqui.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { formatCNJ } from "@/lib/processos/cnj"

export const SECRET_LOOKUP_MESSAGE = "Processo em segredo de justiça: a consulta à fonte pública não é feita."

/** O escritório marcou este processo (pelo id, ou o mesmo número) como segredo de justiça? */
export async function isSecretInOffice(db: SupabaseClient, organizationId: string, digits: string, processId?: string): Promise<boolean> {
  const byNumber = `data->>cnj.eq.${digits},data->>number.eq.${formatCNJ(digits)}`
  const { data, error } = await db
    .from("processes")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("data->>secret", "true")
    .or(processId ? `id.eq.${processId},${byNumber}` : byNumber)
    .limit(1)
  // Na dúvida (falha ao ler o cadastro), não consulta: melhor uma consulta a menos que um vazamento.
  if (error) return true
  return (data ?? []).length > 0
}
