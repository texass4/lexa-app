/**
 * Fontes da Triagem → eventos. Cada fonte só diz O QUE aconteceu (tipo, origem, data,
 * processo, texto); as regras de triagem (estado, auditoria, timeline, IA, prazo) são
 * as mesmas para todas e ficam no banco (`save_triage_items`) e em `model.ts`.
 *
 *   DJEN → capture.ts → save_intimacoes → save_triage_items
 *   DataJud → monitor.ts → movementTriageItems → save_triage_items
 *
 * Lógica pura.
 */

import { fold } from "@/lib/format"
import { addCalendarDays } from "@/lib/intimacoes/calendar"
import type { DeadlineSuggestion } from "@/lib/intimacoes/deadline"
import { categorizeMovement, interpretMovement, type MovementCategory } from "@/lib/services/processes/movement-interpreter"
import type { Process, ProcessMovement, TriageKind, TriageSource } from "@/types"

/** Um evento para `save_triage_items` (nomes das colunas). Nunca chega decidido. */
export interface TriageItemInput {
  id?: string
  organization_id: string
  kind: TriageKind
  source: TriageSource
  /** Identidade na fonte — o mesmo evento nunca entra duas vezes. */
  source_key: string
  intimacao_id?: string
  process_id?: string
  client_id?: string
  link_method?: "cnj" | "manual" | "processo"
  cnj?: string
  process_number?: string
  event_date: string
  available_at?: string
  title: string
  excerpt?: string
  tribunal?: string
  orgao?: string
  /** O banco só aceita alguém ativo do escritório; senão fica sem responsável. */
  responsible_id?: string
  suggestion?: DeadlineSuggestion
  state: "pendente" | "em_revisao"
  review_reason?: string
}

/* ----------------------------- DataJud: movimentações ----------------------------- */

/** Movimentação nova mais antiga que isso não entra (ex.: histórico de um processo recém-acompanhado). */
export const RECENT_MOVEMENT_DAYS = 30
/** Teto por processo numa sincronização — um lote de dezenas de atos não inunda a Triagem. */
export const MAX_MOVEMENTS_PER_SYNC = 10

/**
 * Categorias que costumam pedir atenção do advogado. Comunicações (intimação,
 * publicação) ficam de fora: o teor delas chega pelo DJEN, com prazo.
 */
const RELEVANT_CATEGORIES: ReadonlySet<MovementCategory> = new Set(["julgamento", "audiencia", "prazo"])
/** Mesmo com cara de "julgamento", não pede ação ("Conclusos para despacho" é só o envio ao juiz). */
const ROUTINE = ["mero expediente", "concluso"]
/** Pedem atenção mesmo fora das categorias acima. */
const ALWAYS = ["citacao", "transito em julgado"]

export function isRelevantMovement(movement: Pick<ProcessMovement, "title" | "code" | "complements" | "kind">) {
  const name = fold(movement.title ?? "")
  if (ALWAYS.some((fragment) => name.includes(fragment))) return true
  if (ROUTINE.some((fragment) => name.includes(fragment))) return false
  return RELEVANT_CATEGORIES.has(
    categorizeMovement({ code: movement.code, name: movement.title ?? "", complements: movement.complements, kind: movement.kind }),
  )
}

/**
 * Movimentações novas de um processo acompanhado → eventos da Triagem. Só as
 * relevantes e recentes; o responsável é o do processo. Sem sugestão de prazo: a
 * movimentação não traz teor nem publicação (o prazo corre da intimação).
 */
export function movementTriageItems(input: {
  organizationId: string
  process: Pick<Process, "id" | "cnj" | "number" | "clientId" | "ownerId" | "tribunal">
  movements: ProcessMovement[]
  /** `YYYY-MM-DD` de hoje (fuso do escritório). */
  today: string
}): TriageItemInput[] {
  const since = addCalendarDays(input.today, -RECENT_MOVEMENT_DAYS)
  return input.movements
    .filter((m) => m.at.slice(0, 10) >= since && isRelevantMovement(m))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_MOVEMENTS_PER_SYNC)
    .map((m) => {
      const interpreted = interpretMovement(m, input.process.id)
      return {
        organization_id: input.organizationId,
        kind: "movimentacao",
        source: "datajud",
        source_key: `${input.process.id}:${m.hash ?? m.id}`,
        process_id: input.process.id,
        client_id: input.process.clientId || undefined,
        link_method: "processo",
        cnj: input.process.cnj,
        process_number: input.process.number,
        event_date: m.at.slice(0, 10),
        title: interpreted.title.slice(0, 200),
        excerpt: interpreted.description?.slice(0, 600),
        tribunal: input.process.tribunal,
        orgao: interpreted.judicialUnit?.name,
        responsible_id: input.process.ownerId || undefined,
        state: "pendente",
      }
    })
}
