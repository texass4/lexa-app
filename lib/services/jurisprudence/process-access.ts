/**
 * Processo do escritório lido com a sessão de quem chama (RLS: só o próprio
 * escritório e com `processes.view`). Usado pelas rotas de jurisprudência do processo.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Process } from "@/types"
import { JurisprudenceError } from "./errors"

export async function readProcess(supabase: SupabaseClient, processId: string): Promise<Process> {
  const { data, error } = await supabase.from("processes").select("data").eq("id", processId).maybeSingle<{ data: Process }>()
  if (error) throw new JurisprudenceError("UNAVAILABLE", `processo: ${error.code} ${error.message}`)
  if (!data) throw new JurisprudenceError("NOT_FOUND", "processo inexistente ou de outro escritório")
  return data.data
}
