"use client"

import * as React from "react"
import { getSupabase } from "@/lib/supabase/client"
import { useSession } from "@/lib/auth/session"
import { INTIMACAO_COLUMNS, statusAfterLink, toIntimacao, upsertIntimacao, type IntimacaoDbRow } from "@/lib/intimacoes/rows"
import type { Intimacao, LawyerOab, TriageStatus } from "@/types"

/**
 * Intimações do escritório na tela: a caixa de triagem (tudo que está aberto e o que
 * foi decidido nos últimos 60 dias), atualizada pelo Realtime — sem polling. A RLS
 * decide o que cada pessoa lê e altera; o banco guarda a trilha de auditoria de cada
 * ação (vincular, confirmar, rejeitar) com quem fez e quando.
 */

const RECENT_DAYS = 60

export interface IntimacaoEvent {
  id: number
  actorId?: string
  action: "capturada" | "visualizou" | "vinculou" | "desvinculou" | "atribuiu" | "confirmou_prazo" | "rejeitou_prazo" | "marcou_revisao"
  detail: Record<string, unknown>
  createdAt: string
}

type Result = { ok: true } | { ok: false; message: string }

interface IntimacoesState {
  items: Intimacao[]
  /** Inscrições na OAB do escritório (para mostrar qual recebeu cada intimação). */
  oabs: LawyerOab[]
  loading: boolean
  /** Tabela ainda não existe (migração 0011) ou falha de leitura. */
  unavailable: boolean
  /** Vincula ao processo (a sugestão decide se fica "aguardando" ou "revisar"). */
  link(intimacao: Intimacao, processId: string, clientId?: string): Promise<Result>
  /** Depois que o Prazo foi criado (`addPrazo`), marca a intimação como confirmada. */
  markConfirmed(intimacao: Intimacao, prazoId: string): Promise<Result>
  reject(intimacao: Intimacao, note?: string): Promise<Result>
  markReview(intimacao: Intimacao, note?: string): Promise<Result>
  /** "Visualizou" na trilha (uma vez por pessoa). */
  markViewed(id: string): void
  events(id: string): Promise<IntimacaoEvent[]>
  /** Intimações de um processo (inclusive as mais antigas que a janela da triagem). */
  ofProcess(processId: string): Promise<Intimacao[]>
}

const Context = React.createContext<IntimacoesState | null>(null)

export function IntimacoesProvider({ children }: { children: React.ReactNode }) {
  const { organization, can } = useSession()
  const allowed = can("processes.view")
  const [items, setItems] = React.useState<Intimacao[]>([])
  const [loading, setLoading] = React.useState(allowed)
  const [unavailable, setUnavailable] = React.useState(false)
  const [oabs, setOabs] = React.useState<LawyerOab[]>([])
  const viewed = React.useRef(new Set<string>())

  React.useEffect(() => {
    if (!allowed) return
    const supabase = getSupabase()
    let cancelled = false
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10)

    const apply = (row: IntimacaoDbRow) => setItems((list) => upsertIntimacao(list, toIntimacao(row)))

    // Tempo real primeiro, depois a leitura: nada do que chegar no meio se perde (o upsert não duplica).
    const channel = supabase
      .channel(`intimacoes:${organization.id}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "intimacoes", filter: `organization_id=eq.${organization.id}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id
          if (id) setItems((list) => list.filter((i) => i.id !== id))
          return
        }
        const row = payload.new as IntimacaoDbRow
        if (row?.organization_id === organization.id) apply(row)
      })
      .subscribe()

    void supabase
      .from("intimacoes")
      .select(INTIMACAO_COLUMNS)
      .or(`status.in.(pendente,revisao,sem_processo),available_at.gte.${since}`)
      .order("available_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setUnavailable(true)
        else for (const row of data as unknown as IntimacaoDbRow[]) apply(row)
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

  const value = React.useMemo<IntimacoesState>(() => {
    const supabase = getSupabase()

    /** Atualização condicionada: só se a intimação ainda está como a tela mostra (outra pessoa pode ter decidido). */
    const update = async (intimacao: Intimacao, patch: Record<string, unknown>, allowedFrom: TriageStatus[]): Promise<Result> => {
      const { data, error } = await supabase
        .from("intimacoes")
        .update(patch)
        .eq("id", intimacao.id)
        .in("status", allowedFrom)
        .select(INTIMACAO_COLUMNS)
      if (error) return { ok: false, message: "Não foi possível salvar. Confira sua permissão e tente de novo." }
      if (!data?.length) return { ok: false, message: "Outra pessoa já tratou esta intimação. A tela foi atualizada." }
      setItems((list) => upsertIntimacao(list, toIntimacao(data[0] as unknown as IntimacaoDbRow)))
      return { ok: true }
    }

    return {
      items,
      oabs,
      loading,
      unavailable,
      link: (intimacao, processId, clientId) =>
        update(intimacao, { process_id: processId, client_id: clientId ?? null, link_method: "manual", status: statusAfterLink(intimacao) }, [
          "pendente",
          "revisao",
          "sem_processo",
        ]),
      markConfirmed: (intimacao, prazoId) => update(intimacao, { status: "confirmada", prazo_id: prazoId }, ["pendente", "revisao"]),
      reject: (intimacao, note) =>
        update(intimacao, { status: "rejeitada", decision_note: note?.trim() || null }, ["pendente", "revisao", "sem_processo"]),
      markReview: (intimacao, note) => update(intimacao, { status: "revisao", decision_note: note?.trim() || null }, ["pendente"]),
      markViewed(id) {
        if (viewed.current.has(id)) return
        viewed.current.add(id)
        void supabase.rpc("mark_intimacao_viewed", { p_id: id })
      },
      async events(id) {
        const { data, error } = await supabase
          .from("intimacao_events")
          .select("id, actor_id, action, detail, created_at")
          .eq("intimacao_id", id)
          .order("created_at")
        if (error) return []
        return (
          data as { id: number; actor_id: string | null; action: IntimacaoEvent["action"]; detail: Record<string, unknown>; created_at: string }[]
        ).map((e) => ({ id: e.id, actorId: e.actor_id ?? undefined, action: e.action, detail: e.detail ?? {}, createdAt: e.created_at }))
      },
      async ofProcess(processId) {
        const { data, error } = await supabase
          .from("intimacoes")
          .select(INTIMACAO_COLUMNS)
          .eq("process_id", processId)
          .order("available_at", { ascending: false })
          .limit(100)
        if (error) return []
        return (data as unknown as IntimacaoDbRow[]).map(toIntimacao)
      },
    }
  }, [items, oabs, loading, unavailable])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useIntimacoes() {
  const ctx = React.useContext(Context)
  if (!ctx) throw new Error("useIntimacoes deve ser usado dentro de IntimacoesProvider")
  return ctx
}

/** Para o menu: sem o provider (ex.: sem permissão), nada. */
export const useIntimacoesOptional = () => React.useContext(Context)
