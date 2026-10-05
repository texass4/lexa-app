"use client"

import * as React from "react"
import { getSupabase } from "@/lib/supabase/client"
import { useSession } from "@/lib/auth/session"
import { TRIAGE_COLUMNS, toTriageItem, upsertTriage, type TriageDbRow } from "@/lib/triagem/model"
import type { Intimacao, LawyerOab, TriageItem, TriageState } from "@/types"

/**
 * Triagem na tela: os eventos abertos do escritório (e os decididos nos últimos 60
 * dias), de todas as fontes, atualizados pelo Realtime — sem polling. O estado fica no
 * banco; a RLS decide o que cada pessoa lê e altera, e o banco grava quem decidiu,
 * quando, e a trilha de auditoria de cada ação.
 */

const RECENT_DAYS = 60

export type TriageEventAction =
  | "capturado"
  | "visualizou"
  | "vinculou"
  | "desvinculou"
  | "atribuiu"
  | "marcou_revisao"
  | "confirmou_prazo"
  | "rejeitou_prazo"
  | "ignorou"
  | "reabriu"
  | "interpretou"

export interface TriageEvent {
  id: number
  actorId?: string
  action: TriageEventAction
  detail: Record<string, unknown>
  createdAt: string
}

type Result = { ok: true } | { ok: false; message: string }

interface TriagemState {
  items: TriageItem[]
  /** Inscrições na OAB do escritório (para mostrar qual recebeu cada intimação). */
  oabs: LawyerOab[]
  loading: boolean
  /** Tabela ainda não existe (migração 0012) ou falha de leitura. */
  unavailable: boolean
  link(item: TriageItem, processId: string, clientId?: string): Promise<Result>
  assign(item: TriageItem, userId: string): Promise<Result>
  /** Depois que o Prazo foi criado (`addPrazo`), registra a decisão. */
  markConfirmed(item: TriageItem, prazoId: string): Promise<Result>
  /** Decidido sem prazo (nenhum prazo é criado). */
  rejectPrazo(item: TriageItem, note?: string): Promise<Result>
  markReview(item: TriageItem, note?: string): Promise<Result>
  ignore(item: TriageItem, note?: string): Promise<Result>
  /** Volta para pendente (só o que não gerou prazo). */
  reopen(item: TriageItem): Promise<Result>
  /** "Visualizou" na trilha (uma vez por pessoa). */
  markViewed(id: string): void
  events(id: string): Promise<TriageEvent[]>
  /** A comunicação original (teor integral) de um evento do DJEN. */
  intimacao(id: string): Promise<Intimacao | null>
  /** Eventos de um processo (inclusive os mais antigos que a janela da Triagem). */
  ofProcess(processId: string): Promise<TriageItem[]>
}

const Context = React.createContext<TriagemState | null>(null)

type IntimacaoRow = {
  id: string
  organization_id: string
  source: "djen"
  external_id: string
  hash: string | null
  oab_ids: string[] | null
  cnj: string | null
  process_number: string | null
  tribunal: string | null
  orgao: string | null
  tipo_comunicacao: string | null
  tipo_documento: string | null
  classe: string | null
  meio: string | null
  available_at: string
  published_at: string | null
  content: string
  document_url: string | null
  official_url: string | null
  parties: Intimacao["parties"] | null
  lawyers: Intimacao["lawyers"] | null
  created_at: string
}

const INTIMACAO_COLUMNS =
  "id, organization_id, source, external_id, hash, oab_ids, cnj, process_number, tribunal, orgao, tipo_comunicacao, tipo_documento, classe, meio, available_at, published_at, content, document_url, official_url, parties, lawyers, created_at"

const toIntimacao = (r: IntimacaoRow): Intimacao => ({
  id: r.id,
  organizationId: r.organization_id,
  source: r.source,
  externalId: r.external_id,
  hash: r.hash ?? undefined,
  oabIds: r.oab_ids ?? [],
  cnj: r.cnj ?? undefined,
  processNumber: r.process_number ?? undefined,
  tribunal: r.tribunal ?? undefined,
  orgao: r.orgao ?? undefined,
  tipoComunicacao: r.tipo_comunicacao ?? undefined,
  tipoDocumento: r.tipo_documento ?? undefined,
  classe: r.classe ?? undefined,
  meio: r.meio ?? undefined,
  availableAt: r.available_at,
  publishedAt: r.published_at ?? undefined,
  content: r.content,
  documentUrl: r.document_url ?? undefined,
  officialUrl: r.official_url ?? undefined,
  parties: r.parties ?? [],
  lawyers: r.lawyers ?? [],
  createdAt: r.created_at,
})

export function TriagemProvider({ children }: { children: React.ReactNode }) {
  const { organization, can } = useSession()
  const allowed = can("processes.view")
  const [items, setItems] = React.useState<TriageItem[]>([])
  const [loading, setLoading] = React.useState(allowed)
  const [unavailable, setUnavailable] = React.useState(false)
  const [oabs, setOabs] = React.useState<LawyerOab[]>([])
  const viewed = React.useRef(new Set<string>())

  React.useEffect(() => {
    if (!allowed) return
    const supabase = getSupabase()
    let cancelled = false
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10)
    const apply = (row: TriageDbRow) => setItems((list) => upsertTriage(list, toTriageItem(row)))

    // Tempo real primeiro, depois a leitura: nada do que chegar no meio se perde (o upsert não duplica).
    const channel = supabase
      .channel(`triagem:${organization.id}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "triage_items", filter: `organization_id=eq.${organization.id}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id
          if (id) setItems((list) => list.filter((i) => i.id !== id))
          return
        }
        const row = payload.new as TriageDbRow
        if (row?.organization_id === organization.id) apply(row)
      })
      // Exclusões chegam como avisos (migração 0018): o DELETE do Realtime não passa pela RLS.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "realtime_deletions", filter: `organization_id=eq.${organization.id}` }, (payload) => {
        const row = payload.new as { organization_id?: string; collection?: string; record_id?: string }
        if (row.organization_id === organization.id && row.collection === "triage_items" && row.record_id) {
          const id = row.record_id
          setItems((list) => list.filter((i) => i.id !== id))
        }
      })
      .subscribe()

    void supabase
      .from("triage_items")
      .select(TRIAGE_COLUMNS)
      .or(`state.in.(pendente,em_revisao),event_date.gte.${since}`)
      .order("event_date", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn("[triagem] Não foi possível ler as intimações (migração 0012 aplicada?):", error)
          setUnavailable(true)
        }
        else for (const row of data as unknown as TriageDbRow[]) apply(row)
        setLoading(false)
      })

    void supabase
      .from("lawyer_oabs")
      .select("id, organization_id, user_id, number, uf, active, created_at")
      .then(({ data, error }) => {
        if (cancelled || error) return
        setOabs(
          (data as { id: string; organization_id: string; user_id: string; number: string; uf: string; active: boolean; created_at: string }[]).map(
            (o) => ({
              id: o.id,
              organizationId: o.organization_id,
              userId: o.user_id,
              number: o.number,
              uf: o.uf,
              active: o.active,
              createdAt: o.created_at,
            }),
          ),
        )
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [allowed, organization.id])

  const value = React.useMemo<TriagemState>(() => {
    const supabase = getSupabase()

    /** Atualização condicionada: só se o evento ainda está como a tela mostra (outra pessoa pode ter decidido). */
    const update = async (item: TriageItem, patch: Record<string, unknown>, from: TriageState[]): Promise<Result> => {
      const { data, error } = await supabase.from("triage_items").update(patch).eq("id", item.id).in("state", from).select(TRIAGE_COLUMNS)
      if (error) return { ok: false, message: "Não foi possível salvar. Confira sua permissão e tente de novo." }
      if (!data?.length) return { ok: false, message: "Outra pessoa já tratou este evento. A tela foi atualizada." }
      setItems((list) => upsertTriage(list, toTriageItem(data[0] as unknown as TriageDbRow)))
      return { ok: true }
    }
    const note = (text?: string) => text?.trim().slice(0, 1000) || null
    const OPEN: TriageState[] = ["pendente", "em_revisao"]

    return {
      items,
      oabs,
      loading,
      unavailable,
      link: (item, processId, clientId) => update(item, { process_id: processId, client_id: clientId ?? null, link_method: "manual" }, OPEN),
      assign: (item, userId) => update(item, { responsible_id: userId }, OPEN),
      markConfirmed: (item, prazoId) => update(item, { state: "decidido", decision: "prazo_criado", prazo_id: prazoId }, OPEN),
      rejectPrazo: (item, text) => update(item, { state: "decidido", decision: "sem_prazo", decision_note: note(text) }, OPEN),
      markReview: (item, text) => update(item, { state: "em_revisao", review_reason: note(text) ?? "Marcado para revisão." }, ["pendente"]),
      ignore: (item, text) => update(item, { state: "ignorado", decision_note: note(text) }, OPEN),
      reopen: (item) => update(item, { state: "pendente", decision_note: null }, ["decidido", "ignorado"]),
      markViewed(id) {
        if (viewed.current.has(id)) return
        viewed.current.add(id)
        void supabase.rpc("mark_triage_viewed", { p_id: id })
      },
      async events(id) {
        const { data, error } = await supabase
          .from("triage_events")
          .select("id, actor_id, action, detail, created_at")
          .eq("item_id", id)
          .order("created_at")
        if (error) return []
        return (
          data as { id: number; actor_id: string | null; action: TriageEventAction; detail: Record<string, unknown>; created_at: string }[]
        ).map((e) => ({
          id: e.id,
          actorId: e.actor_id ?? undefined,
          action: e.action,
          detail: e.detail ?? {},
          createdAt: e.created_at,
        }))
      },
      async intimacao(id) {
        const { data, error } = await supabase.from("intimacoes").select(INTIMACAO_COLUMNS).eq("id", id).maybeSingle()
        if (error || !data) return null
        return toIntimacao(data as unknown as IntimacaoRow)
      },
      async ofProcess(processId) {
        const { data, error } = await supabase
          .from("triage_items")
          .select(TRIAGE_COLUMNS)
          .eq("process_id", processId)
          .order("event_date", { ascending: false })
          .limit(100)
        if (error) return []
        return (data as unknown as TriageDbRow[]).map(toTriageItem)
      },
    }
  }, [items, oabs, loading, unavailable])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useTriagem() {
  const ctx = React.useContext(Context)
  if (!ctx) throw new Error("useTriagem deve ser usado dentro de TriagemProvider")
  return ctx
}

/** Para o menu e o perfil do processo: sem o provider (ex.: sem permissão), nada. */
export const useTriagemOptional = () => React.useContext(Context)
