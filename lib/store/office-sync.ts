/**
 * Sincronização do store com o Supabase quando várias pessoas do escritório usam a
 * Íntegra ao mesmo tempo. O banco é a fonte de verdade; o store é a cópia local.
 *
 *   Banco → Realtime → `applyRemote` → store → tela
 *   tela → ação → store → `flush` (gravação condicionada à versão) → banco → Realtime → outras pessoas
 *
 * Esta é a única camada que:
 *   * guarda a versão (`updated_at`) de cada registro conhecido;
 *   * grava (fila única, uma gravação por vez, na ordem das ações);
 *   * assina o Realtime (um canal por escritório, INSERT/UPDATE/DELETE de todas as coleções);
 *   * revalida com o banco (reconexão, volta à aba).
 *
 * Regras que evitam duplicar ou perder dados:
 *   * Tudo é aplicado por id (`upsertById`/`removeById`): o eco do Realtime de uma
 *     gravação própria não duplica — e é ignorado por não ser mais novo que a versão
 *     que a resposta da gravação já trouxe.
 *   * Evento de um registro com alteração local pendente ou em gravação não é
 *     aplicado na hora (sobrescreveria a edição): fica guardado e é reaplicado quando
 *     a gravação termina — se ela foi recusada, o registro atual já veio junto.
 *   * Alteração/exclusão só grava se o registro está na versão conhecida (atômico no
 *     banco, `storage.ts`). Recusada: aviso, e só aquele registro é recarregado.
 *   * Formulários guardam a versão que abriram (`versionOf`). Se outra pessoa gravou
 *     depois disso (`external`), salvar é recusado antes mesmo de ir ao banco.
 */

import type { RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js"
import {
  COLLECTIONS,
  TABLES,
  compareVersions,
  diffIds,
  diffState,
  emptySyncResult,
  emptyVersions,
  fetchManifest,
  fetchRecords,
  insertRecord,
  loadState,
  removeById,
  syncState,
  upsertById,
  type Collection,
  type PersistedState,
  type ServerRow,
  type Snapshot,
  type StateDiff,
  type SyncResult,
  type Versions,
} from "./storage"

type Entity = { id: string }

/** Resultado de salvar um registro editado num formulário. */
export type SaveResult<T> =
  | { status: "saved" }
  /** Outra pessoa alterou antes: nada foi gravado; `current` é o registro atual. */
  | { status: "conflict"; current: T }
  /** Outra pessoa excluiu o registro. */
  | { status: "removed" }
  /** Sem permissão, falha de rede ou regra do banco (o aviso já foi mostrado). */
  | { status: "error" }

/** Avisos para a pessoa (o provider transforma em toast). */
export type SyncNotice =
  | { kind: "stale"; removed: boolean }
  | { kind: "write-failed"; result: SyncResult }
  | { kind: "insert-failed"; key: Collection; error: "denied" | "conflict" | "failed" }
  | { kind: "realtime"; connected: boolean }

/** Ausência mínima da aba para revalidar ao voltar. */
export const REVALIDATE_AFTER_HIDDEN_MS = 3 * 60_000
/** Tempo sem tempo real antes de avisar a pessoa (reconexões rápidas não incomodam). */
const REALTIME_WARNING_AFTER_MS = 30_000

type RowPayload = { organization_id?: string; id?: string; data?: Entity; updated_at?: string }

interface Options<S extends PersistedState> {
  supabase: SupabaseClient
  organizationId: string
  /** Estado atual do store (lido na hora de cada operação). */
  state: { current: S }
  /** Publica um estado novo para a tela. */
  render(next: S): void
  notify(notice: SyncNotice): void
}

type Deferred = { key: Collection; row: ServerRow } | { key: Collection; id: string; deleted: true }

const ref = (key: Collection, id: string) => `${key}:${id}`

const cloneVersions = (versions: Versions): Versions =>
  Object.fromEntries(COLLECTIONS.map((key) => [key, new Map(versions[key])])) as unknown as Versions

export class OfficeSync<S extends PersistedState> {
  private readonly opts: Options<S>
  /** Último estado que foi para o banco (ou veio dele). Base do próximo diff. */
  private saved: PersistedState | null = null
  /** Versão atual no banco de cada registro conhecido. */
  private versions = emptyVersions()
  /** Versão mais recente gravada por OUTRA pessoa (ou lida do banco). Formulários abertos antes dela estão desatualizados. */
  private external = emptyVersions()
  private readonly inFlight = new Set<string>()
  private readonly deferred = new Map<string, Deferred>()
  /** Momento (sequência) em que cada registro foi atualizado a partir do banco. */
  private readonly touched = new Map<string, number>()
  /** Momento (sequência) da última recusa por conflito de cada registro. */
  private readonly conflictedAt = new Map<string, number>()
  private seq = 0
  private queue: Promise<unknown> = Promise.resolve()
  private lastRun: Promise<SyncResult | null> = Promise.resolve(null)
  private revalidating = false
  private revalidateAgain = false
  private revalidateAfterHydrate = false
  private realtimeUp = false
  private realtimeWarning: ReturnType<typeof setTimeout> | undefined

  constructor(opts: Options<S>) {
    this.opts = opts
  }

  private get state(): S {
    return this.opts.state.current
  }

  private setState(next: S) {
    this.opts.state.current = next
    this.opts.render(next)
  }

  get hydrated() {
    return this.saved !== null
  }

  get realtimeConnected() {
    return this.realtimeUp
  }

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  /**
   * Primeira carga. `state` já traz, junto com o banco, o que foi criado antes de a
   * carga terminar (gravado em seguida como novo).
   */
  hydrate(snapshot: Snapshot) {
    this.saved = snapshot.state
    this.versions = snapshot.versions
    this.external = cloneVersions(snapshot.versions)
    if (this.revalidateAfterHydrate) {
      this.revalidateAfterHydrate = false
      void this.revalidate()
    }
  }

  /** Troca tudo pelo que está no banco (depois de uma gravação recusada por permissão, regra ou falha). */
  private async reloadAll() {
    try {
      const snapshot = await loadState(this.opts.supabase)
      this.saved = snapshot.state
      this.versions = snapshot.versions
      this.external = cloneVersions(snapshot.versions)
      this.deferred.clear()
      this.setState({ ...this.state, ...snapshot.state })
    } catch (error) {
      console.error("[sincronização] Não foi possível recarregar os dados:", error)
    }
  }

  // -------------------------------------------------------------------------
  // Versões e conflitos
  // -------------------------------------------------------------------------

  /** Versão do registro no banco, para o formulário guardar ao abrir (`null`: ainda não gravado). */
  versionOf(key: Collection, id: string): string | null {
    return this.versions[key].get(id) ?? null
  }

  /**
   * Confere, antes de gravar, se o formulário foi aberto na versão atual. Se outra
   * pessoa gravou depois (o Realtime já trouxe), recusa: devolve o registro atual.
   * `undefined` como versão = sem conferência (ações de um clique usam o registro atual).
   */
  checkBase<T extends Entity>(key: Collection, id: string, baseVersion: string | null | undefined): SaveResult<T> | null {
    if (baseVersion === undefined) return null
    const current = (this.state[key] as Entity[]).find((item) => item.id === id) as T | undefined
    if (!current) {
      this.opts.notify({ kind: "stale", removed: true })
      return { status: "removed" }
    }
    const foreign = this.external[key].get(id)
    if (foreign && (baseVersion === null || compareVersions(baseVersion, foreign) < 0)) {
      this.opts.notify({ kind: "stale", removed: false })
      return { status: "conflict", current }
    }
    return null
  }

  /** O que aconteceu com um registro numa gravação. */
  outcomeFor<T extends Entity>(result: SyncResult | null, key: Collection, id: string): SaveResult<T> {
    if (!result) return { status: "saved" }
    const stale = result.stale.find((s) => s.key === key && s.id === id)
    if (stale) return stale.row ? { status: "conflict", current: stale.row.data as T } : { status: "removed" }
    if (result.denied.includes(key) || result.conflicts.includes(key) || result.failed) return { status: "error" }
    return { status: "saved" }
  }

  // -------------------------------------------------------------------------
  // Gravação
  // -------------------------------------------------------------------------

  /**
   * Grava o que mudou desde a última gravação. Várias chamadas seguidas entram numa
   * fila única, na ordem. Devolve o resultado da gravação que inclui as mudanças atuais.
   */
  flush(): Promise<SyncResult | null> {
    const saved = this.saved
    if (!saved) return Promise.resolve(null)
    const next = pick(this.state)
    const diff = diffState(saved, next)
    if (!Object.keys(diff).length) return this.lastRun
    this.saved = next
    const touchedIds = diffIds(diff)
    for (const { key, id } of touchedIds) this.inFlight.add(ref(key, id))
    const computedAt = this.seq
    const { supabase, organizationId } = this.opts

    const run = this.queue.then(async () => {
      // Mudança feita sobre uma versão que, enquanto esperava na fila, foi recusada por
      // conflito: também é recusada (gravá-la agora passaria por cima da outra pessoa).
      const outdated = this.dropOutdated(diff, computedAt)
      // As atividades desse lote descrevem a mudança recusada: também não entram.
      const droppedActivities =
        outdated.length && diff.activities ? diff.activities.upserts.map((item) => ({ key: "activities" as const, id: item.id })) : []
      if (droppedActivities.length) diff.activities!.upserts = []
      const result = await syncState(supabase, organizationId, diff, this.versions).catch((error): SyncResult => {
        console.error("[sincronização] Falha ao gravar:", error)
        return { ...emptySyncResult(), failed: true }
      })
      result.stale.push(...outdated)
      result.dropped.push(...droppedActivities)
      this.applyResult(result)
      for (const { key, id } of touchedIds) this.inFlight.delete(ref(key, id))
      this.replayDeferred()
      if (result.denied.length || result.conflicts.length || result.failed) {
        this.opts.notify({ kind: "write-failed", result })
        await this.reloadAll()
      }
      return result
    })
    this.queue = run.catch(() => {})
    this.lastRun = run
    return run
  }

  private dropOutdated(diff: StateDiff, computedAt: number): SyncResult["stale"] {
    const outdated: SyncResult["stale"] = []
    for (const key of Object.keys(diff) as Collection[]) {
      const changes = diff[key]!
      const stale = (item: Entity) => (this.conflictedAt.get(ref(key, item.id)) ?? 0) > computedAt
      for (const item of [...changes.upserts, ...changes.deletes].filter(stale)) {
        const current = (this.saved![key] as Entity[]).find((entry) => entry.id === item.id)
        const version = this.versions[key].get(item.id)
        outdated.push({ key, id: item.id, row: current && version ? { id: item.id, data: current, updated_at: version } : null })
      }
      changes.upserts = changes.upserts.filter((item) => !stale(item))
      changes.deletes = changes.deletes.filter((item) => !stale(item))
    }
    return outdated
  }

  private applyResult(result: SyncResult) {
    for (const { key, sent, row } of result.saved) {
      this.versions[key].set(row.id, row.updated_at)
      this.touch(key, row.id)
      // O banco pode completar o registro (código do processo): a cópia local adota.
      if (key === "processes" && (row.data as { code?: string }).code !== (sent as { code?: string }).code) {
        this.adopt(key, row.data, sent)
      }
    }
    for (const { key, id } of result.removed) this.forget(key, id)

    for (const { key, id, row } of result.stale) {
      if (row) this.put(key, row, { force: true })
      else this.drop(key, id, { force: true })
      this.conflictedAt.set(ref(key, id), ++this.seq)
    }
    for (const { key, id } of result.dropped) this.drop(key, id, { force: true, keepVersion: true })
    if (result.stale.length) this.opts.notify({ kind: "stale", removed: result.stale.every((s) => !s.row) })
  }

  /**
   * Cria um registro na hora e espera o banco (ex.: processo, cujo código o banco gera).
   * Devolve o registro como o banco gravou, ou `null` (aviso já mostrado).
   */
  async insertNow<T extends Entity>(key: Collection, item: T): Promise<T | null> {
    const id = ref(key, item.id)
    this.inFlight.add(id)
    try {
      const result = await insertRecord(this.opts.supabase, this.opts.organizationId, key, item).catch(() => ({ error: "failed" as const }))
      if ("error" in result) {
        this.opts.notify({ kind: "insert-failed", key, error: result.error })
        return null
      }
      this.inFlight.delete(id)
      this.put(key, result.row, { force: true, own: true })
      return result.row.data as T
    } finally {
      this.inFlight.delete(id)
      this.replayDeferred()
    }
  }

  /**
   * Cria registros com id fixo só se ainda não existem (ex.: colunas padrão do quadro,
   * que duas pessoas podem abrir ao mesmo tempo). Quem chegar depois recebe os do banco.
   */
  async ensure<T extends Entity>(key: Collection, items: T[]) {
    const { supabase, organizationId } = this.opts
    const rows = items.map((item) => ({ organization_id: organizationId, id: item.id, data: item }))
    const { error } = await supabase.from(TABLES[key]).upsert(rows, { onConflict: "organization_id,id", ignoreDuplicates: true })
    if (error) {
      console.error("[sincronização] Falha ao criar registros padrão:", error)
      return
    }
    const current = await fetchRecords(
      supabase,
      key,
      items.map((item) => item.id),
    ).catch(() => [])
    for (const row of current) this.applyRemote(key, row)
  }

  // -------------------------------------------------------------------------
  // Registros vindos do banco
  // -------------------------------------------------------------------------

  private touch(key: Collection, id: string) {
    this.touched.set(ref(key, id), ++this.seq)
  }

  /** Alteração local ainda não gravada, ou gravação em andamento. */
  private busy(key: Collection, id: string) {
    if (this.inFlight.has(ref(key, id))) return true
    const find = (list: Entity[]) => list.find((item) => item.id === id)
    return find(this.state[key] as Entity[]) !== find(this.saved![key] as Entity[])
  }

  private writeBoth(key: Collection, update: <T extends Entity>(list: T[]) => T[]) {
    const saved = this.saved!
    const nextSaved = update(saved[key] as Entity[])
    if (nextSaved !== saved[key]) this.saved = { ...saved, [key]: nextSaved }
    const state = this.state
    const nextState = update(state[key] as Entity[])
    if (nextState !== state[key]) this.setState({ ...state, [key]: nextState })
  }

  /** Coloca a versão do banco no store (mesmo objeto nos dois lados: nada pendente). */
  private put(key: Collection, row: ServerRow, { force = false, own = false } = {}) {
    if (!this.saved) return
    const known = this.versions[key].get(row.id)
    if (!force && known && compareVersions(row.updated_at, known) <= 0) return
    this.versions[key].set(row.id, row.updated_at)
    if (!own) this.external[key].set(row.id, row.updated_at)
    this.touch(key, row.id)
    this.writeBoth(key, (list) => upsertById(key, list, row.data as (typeof list)[number]))
  }

  /** Tira o registro do store (excluído no banco). */
  private drop(key: Collection, id: string, { force = false, keepVersion = false } = {}) {
    if (!this.saved) return
    if (!force && !this.versions[key].has(id)) return
    if (!keepVersion) this.forget(key, id)
    this.writeBoth(key, (list) => removeById(list, id))
  }

  private forget(key: Collection, id: string) {
    this.versions[key].delete(id)
    this.external[key].delete(id)
    this.touch(key, id)
  }

  /** Troca, nos dois lados, o objeto enviado pelo que o banco devolveu (se ninguém o alterou no meio). */
  private adopt(key: Collection, data: Entity, sent: Entity) {
    const swap = <T extends Entity>(list: T[]) => (list.includes(sent as T) ? list.map((item) => (item === sent ? (data as T) : item)) : list)
    const saved = this.saved!
    this.saved = { ...saved, [key]: swap(saved[key] as Entity[]) }
    const state = this.state
    this.setState({ ...state, [key]: swap(state[key] as Entity[]) })
  }

  /** Registro criado/alterado no banco (Realtime ou revalidação). Idempotente. */
  applyRemote(key: Collection, row: ServerRow) {
    if (!this.saved || !row?.id || !row.data || row.data.id !== row.id || !row.updated_at) return
    if (this.busy(key, row.id)) {
      this.deferred.set(ref(key, row.id), { key, row })
      return
    }
    this.put(key, row)
  }

  /** Registro excluído no banco (Realtime ou revalidação). Idempotente. */
  removeRemote(key: Collection, id: string) {
    if (!this.saved) return
    if (this.busy(key, id)) {
      this.deferred.set(ref(key, id), { key, id, deleted: true })
      return
    }
    this.drop(key, id)
  }

  private replayDeferred() {
    for (const [id, event] of [...this.deferred]) {
      if (this.busy(event.key, "row" in event ? event.row.id : event.id)) continue
      this.deferred.delete(id)
      if ("row" in event) this.put(event.key, event.row)
      else this.drop(event.key, event.id)
    }
  }

  // -------------------------------------------------------------------------
  // Realtime
  // -------------------------------------------------------------------------

  /** Evento do Realtime. Confere o escritório mesmo com o filtro do canal e a RLS. */
  onRealtime(key: Collection, payload: RealtimePostgresChangesPayload<RowPayload>) {
    if (!this.saved) return
    const org = this.opts.organizationId
    if (payload.eventType === "DELETE") {
      const old = payload.old as RowPayload
      if (old?.organization_id !== org || !old.id) return
      this.removeRemote(key, old.id)
      return
    }
    const row = payload.new as RowPayload
    if (row?.organization_id !== org || !row.id || !row.data || !row.updated_at) return
    this.applyRemote(key, { id: row.id, data: row.data, updated_at: row.updated_at })
  }

  /**
   * Assina as mudanças do escritório. Um canal só, com as 10 coleções; o filtro por
   * escritório vale também para exclusões (sem ele, o Realtime entrega exclusões de
   * qualquer escritório). Devolve a função que remove a assinatura.
   */
  subscribe(): () => void {
    const { supabase, organizationId } = this.opts
    const filter = `organization_id=eq.${organizationId}`
    // Tópico único por montagem: remontar (StrictMode, troca de tela) nunca reaproveita um canal fechando.
    let channel: RealtimeChannel = supabase.channel(`office:${organizationId}:${crypto.randomUUID()}`)
    for (const key of COLLECTIONS) {
      channel = channel.on<RowPayload>("postgres_changes", { event: "*", schema: "public", table: TABLES[key], filter }, (payload) =>
        this.onRealtime(key, payload),
      )
    }
    let closed = false
    channel.subscribe((status, error) => {
      if (closed) return
      if (status === "SUBSCRIBED") {
        const wasDown = !this.realtimeUp
        this.realtimeUp = true
        clearTimeout(this.realtimeWarning)
        this.realtimeWarning = undefined
        if (wasDown) this.opts.notify({ kind: "realtime", connected: true })
        // O que mudou enquanto não havia assinatura (antes da primeira, ou durante a queda).
        void this.revalidate()
        return
      }
      // CHANNEL_ERROR, TIMED_OUT, CLOSED: o cliente do Supabase tenta de novo sozinho.
      this.realtimeUp = false
      if (error) console.warn("[tempo real]", status, error.message)
      this.realtimeWarning ??= setTimeout(() => {
        this.realtimeWarning = undefined
        if (!this.realtimeUp && !closed) this.opts.notify({ kind: "realtime", connected: false })
      }, REALTIME_WARNING_AFTER_MS)
    })
    return () => {
      closed = true
      this.realtimeUp = false
      clearTimeout(this.realtimeWarning)
      this.realtimeWarning = undefined
      void supabase.removeChannel(channel)
    }
  }

  // -------------------------------------------------------------------------
  // Revalidação
  // -------------------------------------------------------------------------

  /**
   * Confere o store com o banco: baixa só id + versão de cada coleção e busca apenas
   * os registros novos ou alterados; tira os que saíram. Não substitui alterações
   * locais pendentes nem registros atualizados enquanto a conferência rodava.
   */
  async revalidate(): Promise<void> {
    if (!this.saved) {
      this.revalidateAfterHydrate = true
      return
    }
    if (this.revalidating) {
      this.revalidateAgain = true
      return
    }
    this.revalidating = true
    const startedAt = this.seq
    const { supabase } = this.opts
    try {
      const manifests = await Promise.all(COLLECTIONS.map((key) => fetchManifest(supabase, key)))
      await Promise.all(
        COLLECTIONS.map(async (key, i) => {
          const manifest = manifests[i]
          const known = this.versions[key]
          const changed = [...manifest].filter(([id, version]) => !known.has(id) || compareVersions(version, known.get(id)!) > 0).map(([id]) => id)
          const gone = [...known.keys()].filter((id) => !manifest.has(id) && (this.touched.get(ref(key, id)) ?? 0) <= startedAt)
          const rows = changed.length ? await fetchRecords(supabase, key, changed) : []
          for (const row of rows) this.applyRemote(key, row)
          for (const id of gone) this.removeRemote(key, id)
        }),
      )
    } catch (error) {
      console.warn("[sincronização] Não foi possível revalidar os dados:", error)
    } finally {
      this.revalidating = false
      if (this.revalidateAgain) {
        this.revalidateAgain = false
        void this.revalidate()
      }
    }
  }
}

/** Só as coleções (o estado do store tem também sinalizadores de sessão). */
function pick(state: PersistedState): PersistedState {
  return Object.fromEntries(COLLECTIONS.map((key) => [key, state[key]])) as unknown as PersistedState
}
