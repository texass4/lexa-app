/**
 * Salvamento automático de uma página (sem React nem banco: a gravação é injetada).
 *
 * Regras:
 * - Junta as edições e grava depois de uma pausa (`debounceMs`), ou no máximo a cada
 *   `maxWaitMs` enquanto a pessoa digita sem parar — nunca a cada tecla.
 * - Uma gravação por vez. O que for editado durante a gravação vai na próxima; uma
 *   resposta antiga nunca apaga edição mais nova (o estado local é sempre o mais recente,
 *   e o banco só aceita a gravação feita sobre a versão que ele tem).
 * - "Salvo" só depois que o banco confirma.
 * - Falha de rede/servidor: guarda o conteúdo e tenta de novo, com espera crescente.
 * - Conflito (outra pessoa gravou antes) ou página excluída/sem acesso: para e guarda o
 *   conteúdo até a pessoa decidir.
 */
import type { DocNode } from "./model"

export interface PagePatch {
  title?: string
  content?: DocNode
}

export type SaveOutcome =
  | { status: "saved"; version: number; updatedAt: string }
  | { status: "conflict"; version?: number; updatedBy?: string | null; updatedAt?: string }
  | { status: "missing" }
  | { status: "error" }

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict" | "missing"

export interface SaverSnapshot {
  state: SaveState
  version: number
  savedAt?: string
  /** Próxima tentativa automática (ms desde a época), quando `state` é "error". */
  retryAt?: number
  conflict?: { version?: number; updatedBy?: string | null; updatedAt?: string }
}

interface Timers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
  now: () => number
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
}

export interface SaverOptions {
  version: number
  save: (patch: PagePatch, baseVersion: number) => Promise<SaveOutcome>
  debounceMs?: number
  maxWaitMs?: number
  retryDelays?: number[]
  timers?: Timers
}

export class PageSaver {
  private pending: PagePatch | null = null
  private inflight: Promise<void> | null = null
  private timer: unknown = null
  private firstDirtyAt = 0
  private attempts = 0
  private listeners = new Set<() => void>()
  private snap: SaverSnapshot
  private readonly opts: Required<Omit<SaverOptions, "version">>

  constructor(options: SaverOptions) {
    this.opts = {
      save: options.save,
      debounceMs: options.debounceMs ?? 900,
      maxWaitMs: options.maxWaitMs ?? 5000,
      retryDelays: options.retryDelays ?? [2000, 5000, 10_000, 20_000, 30_000],
      timers: options.timers ?? realTimers,
    }
    this.snap = { state: "saved", version: options.version }
  }

  get snapshot(): SaverSnapshot {
    return this.snap
  }

  get version() {
    return this.snap.version
  }

  /** O que ainda não chegou ao banco (para reabrir a página sem perder nada). */
  get unsaved(): PagePatch | null {
    return this.pending
  }

  hasUnsaved() {
    return this.pending !== null || this.inflight !== null
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private set(next: Partial<SaverSnapshot>) {
    this.snap = { ...this.snap, ...next }
    for (const l of this.listeners) l()
  }

  /** Nova versão vinda do banco (página recarregada sem nada pendente). */
  rebase(version: number) {
    if (this.hasUnsaved()) return
    this.set({ version, state: "saved", conflict: undefined, retryAt: undefined })
  }

  edit(patch: PagePatch) {
    this.pending = { ...this.pending, ...patch }
    if (this.snap.state === "conflict" || this.snap.state === "missing") return
    if (this.snap.state !== "saving") this.set({ state: "dirty", retryAt: undefined })
    const now = this.opts.timers.now()
    if (!this.firstDirtyAt) this.firstDirtyAt = now
    const waited = now - this.firstDirtyAt
    this.schedule(Math.max(0, Math.min(this.opts.debounceMs, this.opts.maxWaitMs - waited)))
  }

  private schedule(ms: number) {
    if (this.timer !== null) this.opts.timers.clear(this.timer)
    this.timer = this.opts.timers.set(() => {
      this.timer = null
      void this.flush()
    }, ms)
  }

  /** Grava agora o que estiver pendente (sair da página, Ctrl+S, "Tentar agora"). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      this.opts.timers.clear(this.timer)
      this.timer = null
    }
    if (this.inflight) {
      await this.inflight
      if (this.pending && this.snap.state !== "conflict" && this.snap.state !== "missing") return this.flush()
      return
    }
    if (!this.pending || this.snap.state === "conflict" || this.snap.state === "missing") return
    const sent = this.pending
    this.pending = null
    this.firstDirtyAt = 0
    this.set({ state: "saving" })
    this.inflight = this.run(sent).finally(() => {
      this.inflight = null
    })
    await this.inflight
  }

  private async run(sent: PagePatch) {
    let outcome: SaveOutcome
    try {
      outcome = await this.opts.save(sent, this.snap.version)
    } catch {
      outcome = { status: "error" }
    }
    if (outcome.status === "saved") {
      this.attempts = 0
      this.set({ version: outcome.version, savedAt: outcome.updatedAt, retryAt: undefined })
      if (this.pending) {
        this.set({ state: "dirty" })
        this.firstDirtyAt = this.opts.timers.now()
        this.schedule(this.opts.debounceMs)
      } else this.set({ state: "saved" })
      return
    }
    // Não gravou: o que foi enviado volta para a fila, por baixo do que veio depois.
    this.pending = { ...sent, ...this.pending }
    if (outcome.status === "conflict") {
      this.set({ state: "conflict", conflict: { version: outcome.version, updatedBy: outcome.updatedBy, updatedAt: outcome.updatedAt } })
    } else if (outcome.status === "missing") {
      this.set({ state: "missing" })
    } else {
      const delay = this.opts.retryDelays[Math.min(this.attempts, this.opts.retryDelays.length - 1)]
      this.attempts += 1
      this.set({ state: "error", retryAt: this.opts.timers.now() + delay })
      this.schedule(delay)
    }
  }

  /** Conflito: grava a versão desta pessoa por cima da que está no banco. */
  async overwrite(latestVersion: number) {
    if (this.snap.state !== "conflict") return
    this.set({ version: latestVersion, state: "dirty", conflict: undefined })
    await this.flush()
  }

  /** Descarta o que não foi gravado (conflito: fica a versão do banco). */
  discard(version?: number) {
    if (this.timer !== null) this.opts.timers.clear(this.timer)
    this.timer = null
    this.pending = null
    this.firstDirtyAt = 0
    this.attempts = 0
    this.set({ state: "saved", conflict: undefined, retryAt: undefined, ...(version !== undefined ? { version } : {}) })
  }

  /** Tenta de novo já (botão, volta da conexão). */
  retryNow() {
    if (this.snap.state === "error" || this.snap.state === "dirty") void this.flush()
  }

  dispose() {
    if (this.timer !== null) this.opts.timers.clear(this.timer)
    this.timer = null
    this.listeners.clear()
  }
}
