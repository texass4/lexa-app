/**
 * Teste multiusuário da sincronização (`lib/store/office-sync.ts`) contra um Supabase
 * de verdade — banco, RLS, Realtime e PostgREST. Não roda no `npm test`: precisa de um
 * projeto com as migrações `0001`…`0007` aplicadas (ex.: `supabase start` local).
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run test:integration
 *
 * Cria dois escritórios e três pessoas (a service role só é usada aqui, para montar e
 * limpar o cenário) e apaga tudo no fim. Cada pessoa tem seu próprio cliente
 * autenticado, conexão de Realtime e cópia do store, como dois navegadores.
 */

import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { OfficeSync, type SyncNotice } from "@/lib/store/office-sync"
import { initialScopes, loadScopes, type PersistedState } from "@/lib/store/storage"
import type { Process, Task } from "@/types"

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skip = !URL || !ANON || !SERVICE ? "defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY" : false

const run = Math.random().toString(36).slice(2, 8)
const PASSWORD = `Teste-${run}-senha!`

type State = PersistedState & { hydrated: boolean }

interface Session {
  name: string
  supabase: SupabaseClient
  org: string
  state: { current: State }
  sync: OfficeSync<State>
  notices: SyncNotice[]
  stop?: () => void
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(what: string, check: () => boolean, timeout = 8000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`Tempo esgotado esperando: ${what}`)
    await wait(50)
  }
  return Date.now() - start
}

let admin: SupabaseClient
const orgs = { a: crypto.randomUUID(), b: crypto.randomUUID() }
const userIds: string[] = []
const opened: Session[] = []

async function createUser(email: string, org: string, role: "owner" | "staff") {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
  userIds.push(data.user.id)
  const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, organization_id: org, role, name: email, email })
  if (profileError) throw profileError
}

async function open(name: string, email: string, org: string, { realtime = true } = {}): Promise<Session> {
  const supabase = createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  const state = { current: { hydrated: false } as State }
  const notices: SyncNotice[] = []
  const sync = new OfficeSync<State>({ supabase, organizationId: org, state, render: () => {}, notify: (n) => notices.push(n) })
  const scopes = initialScopes(new Date())
  const snapshot = await loadScopes(supabase, scopes)
  state.current = { ...snapshot.state, hydrated: true }
  sync.hydrate(snapshot, scopes)
  const session: Session = { name, supabase, org, state, sync, notices }
  opened.push(session)
  if (realtime) {
    session.stop = sync.subscribe()
    await until(`${name} conectar ao tempo real`, () => sync.realtimeConnected)
  }
  return session
}

/** Uma ação do store: muda o estado local e grava (como o provider faz depois de 300 ms). */
function act(session: Session, change: (s: State) => Partial<State>) {
  session.state.current = { ...session.state.current, ...change(session.state.current) }
  return session.sync.flush()
}

const newTask = (org: string, title: string): Task =>
  ({
    id: `t_${crypto.randomUUID()}`,
    organizationId: org,
    createdAt: new Date().toISOString(),
    title,
    dueAt: "2026-10-01T18:00:00",
    priority: "media",
    assigneeId: "",
    status: "pendente",
  }) as Task

const find = <T extends { id: string }>(list: T[], id: string) => list.find((item) => item.id === id)

describe("equipe usando a Íntegra ao mesmo tempo", { skip }, () => {
  let secretaria: Session
  let advogado: Session
  let outroEscritorio: Session

  before(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    const { error } = await admin.from("organizations").insert([
      { id: orgs.a, name: `Teste A ${run}`, status: "active" },
      { id: orgs.b, name: `Teste B ${run}`, status: "active" },
    ])
    if (error) throw error
    await createUser(`secretaria-${run}@teste.local`, orgs.a, "staff")
    await createUser(`advogado-${run}@teste.local`, orgs.a, "owner")
    await createUser(`outro-${run}@teste.local`, orgs.b, "owner")
    secretaria = await open("secretária", `secretaria-${run}@teste.local`, orgs.a)
    advogado = await open("advogado", `advogado-${run}@teste.local`, orgs.a)
    outroEscritorio = await open("outro escritório", `outro-${run}@teste.local`, orgs.b)
    // O Realtime confere a RLS de cada assinante na primeira mudança; dá um respiro.
    await wait(500)
  })

  after(async () => {
    for (const s of opened) {
      s.stop?.()
      await s.supabase.removeAllChannels()
      s.supabase.realtime.disconnect()
    }
    if (!admin) return
    await admin.from("organizations").delete().in("id", [orgs.a, orgs.b])
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  })

  it("tarefa criada pela secretária aparece para o advogado, sem recarregar", async () => {
    const task = newTask(orgs.a, "Protocolar petição")
    const result = await act(secretaria, (s) => ({ tasks: [task, ...s.tasks] }))
    assert.equal(result?.saved.length, 1)
    const ms = await until("tarefa chegar ao advogado", () => !!find(advogado.state.current.tasks, task.id))
    console.log(`    criação chegou em ${ms} ms`)
    // O eco do Realtime na própria secretária não duplica.
    await wait(600)
    assert.equal(secretaria.state.current.tasks.filter((t) => t.id === task.id).length, 1)
    assert.equal(advogado.state.current.tasks.filter((t) => t.id === task.id).length, 1)
  })

  it("alteração e exclusão chegam ao outro navegador", async () => {
    const task = newTask(orgs.a, "Ligar para o cliente")
    await act(secretaria, (s) => ({ tasks: [task, ...s.tasks] }))
    await until("criação", () => !!find(advogado.state.current.tasks, task.id))

    await act(secretaria, (s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, title: "Ligar para o cliente às 15h" } : t)) }))
    const ms = await until("alteração", () => find(advogado.state.current.tasks, task.id)?.title === "Ligar para o cliente às 15h")
    console.log(`    alteração chegou em ${ms} ms`)

    await act(secretaria, (s) => ({ tasks: s.tasks.filter((t) => t.id !== task.id) }))
    const msDelete = await until("exclusão", () => !find(advogado.state.current.tasks, task.id))
    console.log(`    exclusão chegou em ${msDelete} ms`)
  })

  it("conflito: quem salva com a versão antiga não sobrescreve (conferência antes de gravar)", async () => {
    const task = newTask(orgs.a, "Revisar contrato")
    await act(secretaria, (s) => ({ tasks: [task, ...s.tasks] }))
    await until("criação", () => !!find(advogado.state.current.tasks, task.id))

    // Os dois abrem o formulário na mesma versão.
    const versionA = secretaria.sync.versionOf("tasks", task.id)
    const versionB = advogado.sync.versionOf("tasks", task.id)
    assert.ok(versionA && versionB)

    // A salva.
    assert.equal(secretaria.sync.checkBase("tasks", task.id, versionA), null)
    await act(secretaria, (s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, title: "Revisar contrato — versão da secretária" } : t)) }))
    await until("alteração de A chegar a B", () => find(advogado.state.current.tasks, task.id)?.title.includes("secretária") ?? false)

    // B tenta salvar com a versão que leu: recusado, com o registro atual.
    const refused = advogado.sync.checkBase<Task>("tasks", task.id, versionB)
    assert.equal(refused?.status, "conflict")
    assert.equal(refused?.status === "conflict" && refused.current.title, "Revisar contrato — versão da secretária")
    assert.deepEqual(advogado.notices.at(-1), { kind: "stale", removed: false })
  })

  it("conflito no banco: gravação com versão antiga é recusada mesmo sem o Realtime ter avisado", async () => {
    // B sem tempo real: não fica sabendo da alteração de A e tenta gravar por cima.
    const offline = await open("advogado sem tempo real", `advogado-${run}@teste.local`, orgs.a, { realtime: false })
    const task = newTask(orgs.a, "Juntar procuração")
    await act(secretaria, (s) => ({ tasks: [task, ...s.tasks] }))
    await offline.sync.revalidate()
    assert.ok(find(offline.state.current.tasks, task.id))

    await act(secretaria, (s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, title: "Juntar procuração (A)" } : t)) }))
    const result = await act(offline, (s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, title: "Juntar procuração (B)" } : t)) }))

    const outcome = offline.sync.outcomeFor<Task>(result, "tasks", task.id)
    assert.equal(outcome.status, "conflict")
    // Só aquele registro foi recarregado, com a versão de A.
    assert.equal(find(offline.state.current.tasks, task.id)?.title, "Juntar procuração (A)")
    const { data } = await admin.from("tasks").select("data").eq("id", task.id).single()
    assert.equal((data!.data as Task).title, "Juntar procuração (A)")
    assert.deepEqual(offline.notices.at(-1), { kind: "stale", removed: false })
  })

  it("duas edições seguidas sobre versão antiga: nenhuma passa por cima (nem a que estava na fila)", async () => {
    const offline = await open("advogado sem tempo real", `advogado-${run}@teste.local`, orgs.a, { realtime: false })
    const task = newTask(orgs.a, "Calcular custas")
    await act(secretaria, (s) => ({ tasks: [task, ...s.tasks] }))
    await offline.sync.revalidate()
    await act(secretaria, (s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, title: "Calcular custas (A)" } : t)) }))

    // B edita duas vezes sem esperar: a segunda gravação entra na fila atrás da primeira.
    const first = act(offline, (s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, title: "Calcular custas (B1)" } : t)) }))
    const second = act(offline, (s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, priority: "alta" as const } : t)) }))
    const [r1, r2] = await Promise.all([first, second])
    assert.equal(offline.sync.outcomeFor(r1, "tasks", task.id).status, "conflict")
    assert.equal(offline.sync.outcomeFor(r2, "tasks", task.id).status, "conflict")
    const { data } = await admin.from("tasks").select("data").eq("id", task.id).single()
    assert.equal((data!.data as Task).title, "Calcular custas (A)")
    assert.equal((data!.data as Task).priority, "media")
    assert.equal(find(offline.state.current.tasks, task.id)?.title, "Calcular custas (A)")
  })

  it("exclusão enquanto outra pessoa edita: a edição é recusada e o registro some", async () => {
    const offline = await open("advogado sem tempo real", `advogado-${run}@teste.local`, orgs.a, { realtime: false })
    const task = newTask(orgs.a, "Agendar perícia")
    await act(secretaria, (s) => ({ tasks: [task, ...s.tasks] }))
    await offline.sync.revalidate()
    await act(secretaria, (s) => ({ tasks: s.tasks.filter((t) => t.id !== task.id) }))
    const result = await act(offline, (s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, title: "Agendar perícia (B)" } : t)) }))
    assert.equal(offline.sync.outcomeFor(result, "tasks", task.id).status, "removed")
    assert.equal(find(offline.state.current.tasks, task.id), undefined)
    const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("id", task.id)
    assert.equal(count, 0)
  })

  it("código de processo gerado pelo banco: cadastros simultâneos recebem códigos diferentes", async () => {
    const draft = (): Process =>
      ({
        id: `p_${crypto.randomUUID()}`,
        organizationId: orgs.a,
        createdAt: new Date().toISOString(),
        code: "",
        number: "",
        type: "Teste",
        movements: [],
      }) as unknown as Process
    const created = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? secretaria : advogado).sync.insertNow("processes", draft())))
    const codes = created.map((p) => p!.code)
    assert.equal(new Set(codes).size, 10, `códigos repetidos: ${codes.join(", ")}`)
    for (const code of codes) assert.match(code, /^#\d{6,}$/)
    const numbers = codes.map((c) => Number(c.slice(1))).sort((a, b) => a - b)
    assert.equal(numbers[0], 103000)
    assert.equal(numbers.at(-1), 103009)
    console.log(`    códigos: ${[...codes].sort().join(" ")}`)
    // O eco não duplica, e o outro navegador recebe todos.
    await until("processos chegarem aos dois", () =>
      created.every((p) => find(advogado.state.current.processes, p!.id) && find(secretaria.state.current.processes, p!.id)),
    )
    assert.equal(advogado.state.current.processes.length, 10)
    assert.equal(secretaria.state.current.processes.length, 10)
  })

  it("volta à aba: a revalidação traz inserções, alterações e exclusões perdidas", async () => {
    const away = await open("advogado com a aba parada", `advogado-${run}@teste.local`, orgs.a, { realtime: false })
    const kept = newTask(orgs.a, "Continua")
    const removed = newTask(orgs.a, "Vai sair")
    await act(secretaria, (s) => ({ tasks: [kept, removed, ...s.tasks] }))
    await away.sync.revalidate()
    const before = away.state.current.tasks.length

    const added = newTask(orgs.a, "Nova enquanto a aba estava parada")
    await act(secretaria, (s) => ({
      tasks: [added, ...s.tasks.filter((t) => t.id !== removed.id).map((t) => (t.id === kept.id ? { ...t, title: "Continua (alterada)" } : t))],
    }))

    await away.sync.revalidate()
    assert.ok(find(away.state.current.tasks, added.id))
    assert.equal(find(away.state.current.tasks, kept.id)?.title, "Continua (alterada)")
    assert.equal(find(away.state.current.tasks, removed.id), undefined)
    assert.equal(away.state.current.tasks.length, before)
  })

  it("outro escritório não recebe nada", async () => {
    await wait(500)
    for (const key of ["tasks", "processes"] as const) assert.equal(outroEscritorio.state.current[key].length, 0, key)
  })
})
