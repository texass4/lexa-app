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
  fetchVersions,
  loadPage,
  insertRecord,
  loadScope,
  loadScopes,
  removeById,
  syncState,
  upsertById,
  type Collection,
  type PersistedState,
  type Scope,
  type ServerRow,
  type Snapshot,
  type StateDiff,
  type SyncResult,
  type Versions,
  type WriteError,
  classify,
} from "./storage"

type Entity = { id: string }

/**
 * Uma lista do histórico lida em páginas, do mais recente para o mais antigo (ou uma
 * busca no banco). `scope` traz a coleção, o filtro e a ordem (`order`); `cursor` dá
 * a chave de ordem de um registro (a mesma coluna de `order`).
 */
export interface PagedList<T = Entity> {
  id: string
  scope: Omit<Scope, "id" | "latest" | "offset" | "entity">
  size: number
  cursor: (item: T) => string
}

export interface PageState {
  /** Registros lidos até agora. */
  loaded: number
  /** A última página veio incompleta: não há mais nada no banco. */
  done: boolean
  /** Chave de ordem do último registro lido: tudo o que é mais recente já está na memória. */
  cursor?: string
  /** Total da lista no banco (contado na primeira página). */
  total?: number
}

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
/** Linha de `realtime_deletions` (aviso de exclusão, migração 0018). */
export type DeletionPayload = { organization_id?: string; collection?: string; record_id?: string }
const COLLECTION_BY_TABLE = new Map<string, Collection>(COLLECTIONS.map((key) => [TABLES[key], key]))

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

/** Campos que o banco preenche ao gravar (gatilhos das migrações 0007 e 0008). */
const SERVER_FIELDS: Partial<Record<Collection, string[]>> = {
  processes: ["code"],
  deadlines: ["clientId", "createdById", "taskId", "responsibleId"],
}

/** Processo só com a movimentação mais recente (resumo). */
const isPartial = (key: Collection, item: Entity | undefined) => key === "processes" && !!(item as { movementsPartial?: boolean } | undefined)?.movementsPartial

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
  /** Recortes já carregados (abertura + sob demanda). A revalidação confere só eles. */
  private readonly scopes = new Map<string, Scope>()
  /** Recortes sendo carregados agora (a mesma leitura não sai duas vezes). */
  private readonly loading = new Map<string, Promise<void>>()
  private readonly hydratedSignal: Promise<void>
  private resolveHydrated: () => void = () => {}

  constructor(opts: Options<S>) {
    this.opts = opts
    this.hydratedSignal = new Promise((resolve) => (this.resolveHydrated = resolve))
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
  hydrate(snapshot: Snapshot, scopes: Scope[]) {
    this.saved = snapshot.state
    this.versions = snapshot.versions
    this.external = cloneVersions(snapshot.versions)
    for (const scope of scopes) this.scopes.set(scope.id, scope)
    this.resolveHydrated()
    if (this.revalidateAfterHydrate) {
      this.revalidateAfterHydrate = false
      void this.revalidate()
    }
  }

  // -------------------------------------------------------------------------
  // Sob demanda
  // -------------------------------------------------------------------------

  /** O recorte já está na memória. */
  isLoaded(scopeId: string) {
    return this.scopes.has(scopeId)
  }

  /**
   * Carrega recortes que ainda não vieram (ex.: o histórico de um processo ao abri-lo,
   * todos os documentos ao abrir Documentos). Cada recorte é lido uma vez; o que já
   * está na memória e tem a mesma versão não é trocado, e alteração local pendente não
   * é sobrescrita (`applyRemote`). Espera a abertura terminar.
   */
  async ensureScopes(scopes: Scope[]): Promise<void> {
    await this.hydratedSignal
    await Promise.all(
      scopes.map((scope) => {
        if (this.scopes.has(scope.id)) return undefined
        let pending = this.loading.get(scope.id)
        if (!pending) {
          pending = loadScope(this.opts.supabase, scope)
            .then((rows) => {
              for (const row of rows) this.applyRemote(scope.key, row)
              this.scopes.set(scope.id, scope)
            })
            .finally(() => this.loading.delete(scope.id))
          this.loading.set(scope.id, pending)
        }
        return pending
      }),
    )
  }

  /** Até onde cada lista paginada do histórico já foi lida (ver `loadNextPage`). */
  private pages = new Map<string, PageState>()

  pageState(listId: string): PageState | undefined {
    return this.pages.get(listId)
  }

  /**
   * Próxima página de uma lista do histórico (ou de uma busca no banco): os registros
   * entram no store como os demais e seguem pelo tempo real; a revalidação os confere
   * pelo id. A primeira página traz também o total da lista.
   */
  async loadNextPage<T>(list: PagedList<T>): Promise<void> {
    await this.hydratedSignal
    const key = `pagina:${list.id}`
    const running = this.loading.get(key)
    if (running) return running
    const state = this.pages.get(list.id) ?? { loaded: 0, done: false }
    if (state.done) return
    const pending = loadPage(
      this.opts.supabase,
      { ...list.scope, id: `${list.id}:${state.loaded}`, entity: true, latest: list.size, offset: state.loaded },
      state.loaded === 0,
    )
      .then(({ rows, total }) => {
        for (const row of rows) this.applyRemote(list.scope.key, row)
        const last = rows[rows.length - 1]
        this.pages.set(list.id, {
          loaded: state.loaded + rows.length,
          done: rows.length < list.size,
          cursor: last ? list.cursor(last.data as T) : state.cursor,
          total: total ?? state.total,
        })
      })
      .finally(() => this.loading.delete(key))
    this.loading.set(key, pending)
    return pending
  }

  /** Processos completos (com todo o histórico de movimentações), no lugar do resumo. */
  async ensureFullProcesses(ids: string[]): Promise<void> {
    await this.hydratedSignal
    const missing = ids.filter((id) => isPartial("processes", this.find("processes", id)))
    if (!missing.length) return
    const key = `processes:completo:${[...missing].sort().join(",")}`
    let pending = this.loading.get(key)
    if (!pending) {
      pending = fetchRecords(this.opts.supabase, "processes", missing)
        .then((rows) => {
          for (const row of rows) this.applyRemote("processes", row)
        })
        .finally(() => this.loading.delete(key))
      this.loading.set(key, pending)
    }
    return pending
  }

  private find(key: Collection, id: string): Entity | undefined {
    return (this.state[key] as Entity[]).find((item) => item.id === id)
  }

  /** Troca tudo pelo que está no banco (depois de uma gravação recusada por permissão, regra ou falha). */
  private async reloadAll() {
    try {
      // Os mesmos recortes que estavam na memória (nada além do que a pessoa já abriu).
      const snapshot = await loadScopes(this.opts.supabase, [...this.scopes.values()])
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
      // O banco pode completar o registro (código do processo, cliente e autor do prazo): a cópia local adota.
      const fields = SERVER_FIELDS[key] ?? []
      const server = row.data as unknown as Record<string, unknown>
      const local = sent as unknown as Record<string, unknown>
      if (fields.some((field) => server[field] !== local[field])) this.adopt(key, row.data, sent)
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
   * Cria vários registros e espera o banco (importação de planilha). Grava em lotes; se
   * o banco recusar um lote (ex.: CPF/CNPJ que outra pessoa acabou de cadastrar), tenta
   * um a um para saber exatamente quais falharam. Não mostra avisos: quem chama relata.
   * Mesma RLS do cadastro normal — é o cliente do Supabase de quem está logado.
   */
  async insertMany<T extends Entity>(
    key: Collection,
    items: T[],
    chunkSize = 100,
  ): Promise<{ saved: T[]; failed: { item: T; error: WriteError }[] }> {
    const { supabase, organizationId } = this.opts
    const saved: T[] = []
    const failed: { item: T; error: WriteError }[] = []
    const ids = items.map((item) => ref(key, item.id))
    ids.forEach((id) => this.inFlight.add(id))
    try {
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize)
        const { data, error } = await supabase
          .from(TABLES[key])
          .insert(chunk.map((item) => ({ organization_id: organizationId, id: item.id, data: item })))
          .select("id, data, updated_at")
        if (!error) {
          for (const row of data as ServerRow[]) {
            this.inFlight.delete(ref(key, row.id))
            this.put(key, row, { force: true, own: true })
            saved.push(row.data as T)
          }
          continue
        }
        if (classify(error) === "denied") {
          failed.push(...chunk.map((item) => ({ item, error: "denied" as const })))
          continue
        }
        for (const item of chunk) {
          const result = await insertRecord(supabase, organizationId, key, item).catch(() => ({ error: "failed" as const }))
          if ("error" in result) failed.push({ item, error: result.error })
          else {
            this.inFlight.delete(ref(key, item.id))
            this.put(key, result.row, { force: true, own: true })
            saved.push(result.row.data as T)
          }
        }
      }
    } finally {
      ids.forEach((id) => this.inFlight.delete(id))
      this.replayDeferred()
    }
    return { saved, failed }
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
    if (!force && known) {
      const order = compareVersions(row.updated_at, known)
      // Mesma versão: só vale se o banco trouxe o processo completo no lugar do resumo.
      const upgrade = order === 0 && isPartial(key, this.find(key, row.id)) && !isPartial(key, row.data)
      if (order < 0 || (order === 0 && !upgrade)) return
    }
    // Resumo mais novo de um processo que estava completo: mantém o histórico já carregado
    // (o banco nunca o apaga — `0016_carga_sob_demanda.sql`); só os demais campos mudam.
    const local = this.find(key, row.id)
    if (isPartial(key, row.data) && local && !isPartial(key, local)) {
      const full = local as Entity & { movements?: unknown[] }
      row = { ...row, data: { ...row.data, movements: full.movements, movementsPartial: undefined } as Entity }
    }
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

  /** Aviso de exclusão (`realtime_deletions`): tira o registro, se for deste escritório e de uma coleção do store. */
  onDeletion(row: DeletionPayload | undefined) {
    if (!this.saved || !row || row.organization_id !== this.opts.organizationId || !row.record_id) return
    const key = COLLECTION_BY_TABLE.get(row.collection ?? "")
    if (key) this.removeRemote(key, row.record_id)
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
    // Exclusões chegam como avisos (migração 0018): o DELETE do Realtime não passa pela RLS.
    channel = channel.on<DeletionPayload>("postgres_changes", { event: "INSERT", schema: "public", table: "realtime_deletions", filter }, (payload) =>
      this.onDeletion(payload.new as DeletionPayload),
    )
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
      // Janelas (abertura, coleção inteira, período da agenda): id + versão com o mesmo filtro.
      // Com a coleção inteira carregada, as janelas menores dela não precisam de leitura própria.
      const loaded = [...this.scopes.values()].filter((scope) => !scope.entity)
      const whole = new Set(loaded.filter((scope) => !scope.filter && !scope.latest).map((scope) => scope.key))
      const windows = loaded.filter((scope) => !whole.has(scope.key) || (!scope.filter && !scope.latest))
      const manifests = await Promise.all(windows.map((scope) => fetchManifest(supabase, scope)))
      const seen = new Map<Collection, Map<string, string>>(COLLECTIONS.map((key) => [key, new Map()]))
      windows.forEach((scope, i) => {
        for (const [id, version] of manifests[i]) seen.get(scope.key)!.set(id, version)
      })
      await Promise.all(
        COLLECTIONS.map(async (key) => {
          const manifest = seen.get(key)!
          const known = this.versions[key]
          // Registros na memória fora das janelas (abertos sob demanda): conferidos pelo id.
          const outside = [...known.keys()].filter((id) => !manifest.has(id))
          const current = outside.length ? await fetchVersions(supabase, key, outside) : new Map<string, string>()
          for (const [id, version] of current) manifest.set(id, version)
          const changed = [...manifest].filter(([id, version]) => !known.has(id) || compareVersions(version, known.get(id)!) > 0).map(([id]) => id)
          const gone = outside.filter((id) => !current.has(id) && (this.touched.get(ref(key, id)) ?? 0) <= startedAt)
          for (const row of await this.fetchChanged(key, changed)) this.applyRemote(key, row)
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

  /** Registros alterados: processo que estava completo vem completo; o resto, como resumo. */
  private async fetchChanged(key: Collection, ids: string[]): Promise<ServerRow[]> {
    if (!ids.length) return []
    if (key !== "processes") return fetchRecords(this.opts.supabase, key, ids)
    const full = ids.filter((id) => {
      const local = this.find(key, id)
      return local && !isPartial(key, local)
    })
    const summary = ids.filter((id) => !full.includes(id))
    const [a, b] = await Promise.all([
      full.length ? fetchRecords(this.opts.supabase, key, full) : [],
      summary.length ? fetchRecords(this.opts.supabase, key, summary, "processes_summary") : [],
    ])
    return [...a, ...b]
  }
}

/** Só as coleções (o estado do store tem também sinalizadores de sessão). */
function pick(state: PersistedState): PersistedState {
  return Object.fromEntries(COLLECTIONS.map((key) => [key, state[key]])) as unknown as PersistedState
}
