import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { PageSaver, type PagePatch, type SaveOutcome } from "./autosave"
import {
  breadcrumb,
  buildTree,
  canWritePage,
  descendants,
  likeLiteral,
  moveTargets,
  pageTitle,
  plainText,
  referencedTaskIds,
  type DocNode,
  type PageMeta,
} from "./model"
import { PAGE_TEMPLATES } from "./templates"

const page = (id: string, over: Partial<PageMeta> = {}): PageMeta => ({
  id,
  parentId: null,
  title: id,
  visibility: "office",
  clientId: null,
  processId: null,
  template: null,
  createdBy: "u1",
  updatedBy: null,
  version: 1,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  taskIds: [],
  ...over,
})

describe("árvore de páginas", () => {
  const pages = [
    page("b", { title: "Beta" }),
    page("a", { title: "alfa" }),
    page("a1", { parentId: "a", title: "Sub" }),
    page("a11", { parentId: "a1", title: "Sub-sub" }),
    page("orfa", { parentId: "sumiu", title: "Órfã" }),
  ]

  it("monta a hierarquia com irmãs em ordem alfabética e órfãs na raiz", () => {
    const tree = buildTree(pages)
    assert.deepEqual(
      tree.map((n) => n.page.id),
      ["a", "b", "orfa"],
    )
    assert.equal(tree[0].children[0].page.id, "a1")
    assert.equal(tree[0].children[0].children[0].page.id, "a11")
  })

  it("trilha da raiz até a página e subpáginas em qualquer nível", () => {
    const map = new Map(pages.map((p) => [p.id, p]))
    assert.deepEqual(
      breadcrumb(map, "a11").map((p) => p.id),
      ["a", "a1", "a11"],
    )
    assert.deepEqual(descendants(pages, "a").sort(), ["a1", "a11"])
  })

  it("não oferece mover a página para dentro dela mesma ou de uma subpágina", () => {
    assert.deepEqual(
      moveTargets(pages, "a").map((p) => p.id),
      ["b", "orfa"],
    )
  })

  it("não entra em laço com dados inconsistentes", () => {
    const loop = [page("x", { parentId: "y" }), page("y", { parentId: "x" })]
    assert.equal(breadcrumb(new Map(loop.map((p) => [p.id, p])), "x").length, 2)
    assert.deepEqual(descendants(loop, "x").sort(), ["x", "y"])
  })

  it("título vazio vira 'Sem título'", () => {
    assert.equal(pageTitle(page("z", { title: "  " })), "Sem título")
  })
})

describe("conteúdo e permissões", () => {
  const doc: DocNode = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Pauta" }] },
      { type: "taskRef", attrs: { taskId: "t_1" } },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "ver " },
          { type: "mention", attrs: { kind: "task", id: "x", taskId: "t_2" } },
        ],
      },
      { type: "taskRef", attrs: { taskId: "t_1" } },
    ],
  }

  it("extrai texto e tarefas referenciadas (sem repetir)", () => {
    assert.equal(plainText(doc), "Pauta ver")
    assert.deepEqual(referencedTaskIds(doc), ["t_1", "t_2"])
  })

  it("pessoal só o autor altera; do escritório, quem edita tarefas", () => {
    assert.equal(canWritePage({ visibility: "private", createdBy: "u1" }, "u1", false), true)
    assert.equal(canWritePage({ visibility: "private", createdBy: "u1" }, "u2", true), false)
    assert.equal(canWritePage({ visibility: "office", createdBy: "u1" }, "u2", true), true)
    assert.equal(canWritePage({ visibility: "office", createdBy: "u1" }, "u1", false), false)
  })

  it("busca literal: curingas do ilike escapados", () => {
    assert.equal(likeLiteral("50%_a\\b"), "50\\%\\_a\\\\b")
  })
})

describe("modelos", () => {
  it("os sete modelos pedidos, com documento válido e sem tarefas fictícias", () => {
    assert.deepEqual(
      PAGE_TEMPLATES.map((t) => t.key),
      ["branco", "reuniao", "semana", "projeto", "caso", "procedimento", "ideias"],
    )
    for (const t of PAGE_TEMPLATES) {
      const content = t.content()
      assert.equal(content.type, "doc")
      assert.ok(content.content?.length, t.key)
      assert.deepEqual(referencedTaskIds(content), [], `${t.key} não referencia tarefas`)
      // Cada chamada devolve um documento novo (editar uma página não altera o modelo).
      assert.notEqual(t.content(), content)
    }
  })
})

/* ------------------------------------------------------------- salvamento */

function fakeTimers() {
  let now = 0
  let seq = 0
  const queue = new Map<number, { at: number; fn: () => void }>()
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        seq += 1
        queue.set(seq, { at: now + ms, fn })
        return seq
      },
      clear: (h: unknown) => void queue.delete(h as number),
      now: () => now,
    },
    async advance(ms: number) {
      const target = now + ms
      for (;;) {
        const next = [...queue.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        queue.delete(next[0])
        now = next[1].at
        next[1].fn()
        await new Promise((r) => setImmediate(r))
      }
      now = target
      await new Promise((r) => setImmediate(r))
    },
  }
}

function server(initial = 1) {
  let version = initial
  const calls: { patch: PagePatch; base: number }[] = []
  let mode: "ok" | "error" | "conflict" = "ok"
  let gate: Promise<void> | null = null
  return {
    calls,
    setMode: (m: typeof mode) => (mode = m),
    hold() {
      let release!: () => void
      gate = new Promise((r) => (release = r))
      return () => {
        gate = null
        release()
      }
    },
    bump: () => (version += 1),
    get version() {
      return version
    },
    save: async (patch: PagePatch, base: number): Promise<SaveOutcome> => {
      calls.push({ patch, base })
      if (gate) await gate
      if (mode === "error") return { status: "error" }
      if (mode === "conflict" || base !== version) return { status: "conflict", version, updatedBy: "u2" }
      version += 1
      return { status: "saved", version, updatedAt: `v${version}` }
    },
  }
}

describe("salvamento automático", () => {
  it("junta as teclas e grava uma vez depois da pausa; 'salvo' só após o banco", async () => {
    const t = fakeTimers()
    const db = server()
    const s = new PageSaver({ version: 1, save: db.save, debounceMs: 800, timers: t.timers })
    s.edit({ title: "A" })
    s.edit({ title: "Ab" })
    s.edit({ title: "Abc" })
    assert.equal(s.snapshot.state, "dirty")
    await t.advance(799)
    assert.equal(db.calls.length, 0)
    await t.advance(1)
    assert.equal(db.calls.length, 1)
    assert.deepEqual(db.calls[0].patch, { title: "Abc" })
    assert.equal(s.snapshot.state, "saved")
    assert.equal(s.version, 2)
  })

  it("digitando sem parar, grava no máximo a cada maxWait", async () => {
    const t = fakeTimers()
    const db = server()
    const s = new PageSaver({ version: 1, save: db.save, debounceMs: 800, maxWaitMs: 2000, timers: t.timers })
    for (let i = 0; i < 10; i++) {
      s.edit({ title: `t${i}` })
      await t.advance(300)
    }
    assert.ok(db.calls.length >= 1, "gravou durante a digitação")
  })

  it("edição durante a gravação vai na próxima, sobre a versão nova (resposta antiga não apaga a nova)", async () => {
    const t = fakeTimers()
    const db = server()
    const s = new PageSaver({ version: 1, save: db.save, debounceMs: 500, timers: t.timers })
    s.edit({ title: "primeira" })
    const release = db.hold()
    await t.advance(500)
    assert.equal(s.snapshot.state, "saving")
    s.edit({ title: "segunda" })
    release()
    await t.advance(0)
    assert.equal(s.snapshot.state, "dirty")
    await t.advance(500)
    assert.equal(db.calls.length, 2)
    assert.deepEqual(db.calls[1], { patch: { title: "segunda" }, base: 2 })
    assert.equal(s.snapshot.state, "saved")
    assert.equal(s.version, 3)
  })

  it("falha de rede: guarda o conteúdo e tenta de novo com espera crescente", async () => {
    const t = fakeTimers()
    const db = server()
    db.setMode("error")
    const s = new PageSaver({ version: 1, save: db.save, debounceMs: 100, retryDelays: [1000, 3000], timers: t.timers })
    s.edit({ content: { type: "doc", content: [] } })
    await t.advance(100)
    assert.equal(s.snapshot.state, "error")
    assert.ok(s.hasUnsaved())
    assert.equal(s.snapshot.retryAt, 1100)
    await t.advance(1000)
    assert.equal(db.calls.length, 2)
    assert.equal(s.snapshot.retryAt, 1100 + 3000)
    db.setMode("ok")
    await t.advance(3000)
    assert.equal(s.snapshot.state, "saved")
    assert.equal(s.hasUnsaved(), false)
  })

  it("conflito: para, guarda a edição e só grava por cima quando a pessoa escolhe", async () => {
    const t = fakeTimers()
    const db = server()
    const s = new PageSaver({ version: 1, save: db.save, debounceMs: 100, timers: t.timers })
    db.bump() // outra pessoa gravou (versão 2)
    s.edit({ title: "minha" })
    await t.advance(100)
    assert.equal(s.snapshot.state, "conflict")
    assert.equal(s.snapshot.conflict?.updatedBy, "u2")
    s.edit({ title: "minha 2" })
    await t.advance(5000)
    assert.equal(db.calls.length, 1, "não grava sozinho em conflito")
    await s.overwrite(db.version)
    assert.equal(s.snapshot.state, "saved")
    assert.deepEqual(db.calls[1], { patch: { title: "minha 2" }, base: 2 })
  })

  it("descartar no conflito fica com a versão do banco", async () => {
    const t = fakeTimers()
    const db = server(5)
    const s = new PageSaver({ version: 4, save: db.save, debounceMs: 100, timers: t.timers })
    s.edit({ title: "x" })
    await t.advance(100)
    s.discard(5)
    assert.equal(s.hasUnsaved(), false)
    assert.equal(s.version, 5)
    assert.equal(s.snapshot.state, "saved")
  })

  it("flush grava na hora (sair da página)", async () => {
    const t = fakeTimers()
    const db = server()
    const s = new PageSaver({ version: 1, save: db.save, debounceMs: 10_000, timers: t.timers })
    s.edit({ title: "agora" })
    await s.flush()
    assert.equal(db.calls.length, 1)
    assert.equal(s.snapshot.state, "saved")
  })
})
