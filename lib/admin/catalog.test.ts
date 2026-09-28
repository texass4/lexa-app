import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  EMPTY_USAGE,
  effectiveLimits,
  formatBytes,
  formatLimitValue,
  growth,
  LIMIT_KEYS,
  LIMIT_META,
  monthlyCents,
  parseRange,
  resolvePeriod,
  sanitizeFeatures,
  sanitizeLimits,
  usageAlerts,
  usageLevel,
  type AdminOrganization,
  type AdminPlan,
  type PlanLimits,
} from "./catalog"
import { DEFAULT_SETTINGS, sanitizeSettings } from "./settings"
import { attentionItems } from "./attention"

const MB = 1024 * 1024
const limits: PlanLimits = { users: 10, processes: 500, clients: null, storage: 10240, whatsapp: 1000, ai: 0 }

describe("limites e uso", () => {
  it("limites personalizados sobrepõem os do plano, inclusive para ilimitado", () => {
    const out = effectiveLimits(limits, { users: 15, processes: null })
    assert.equal(out.users, 15)
    assert.equal(out.processes, null)
    assert.equal(out.clients, null)
    assert.equal(out.storage, 10240)
  })

  it("sem plano, tudo é ilimitado", () => {
    assert.ok(LIMIT_KEYS.every((k) => effectiveLimits(undefined)[k] === null))
  })

  it("sanitizeLimits descarta chaves e valores inválidos", () => {
    assert.deepEqual(sanitizeLimits({ users: "8", processes: -1, storage: "", hack: 3, ai: "x" }), { users: 8, storage: null })
    assert.deepEqual(sanitizeLimits(null), {})
  })

  it("nível de uso: normal, próximo, no limite, excedido e ilimitado", () => {
    assert.equal(usageLevel(7, 10), "ok")
    assert.equal(usageLevel(8, 10), "warning")
    assert.equal(usageLevel(437, 500), "warning")
    assert.equal(usageLevel(10, 10), "critical")
    assert.equal(usageLevel(11, 10), "exceeded")
    assert.equal(usageLevel(999, null), "unlimited")
    assert.equal(usageLevel(0, 0), "critical")
    assert.equal(usageLevel(1, 0), "exceeded")
    assert.equal(usageLevel(6, 10, 0.6), "warning")
  })

  it("alertas saem do mais crítico para o menos, ignorando o ilimitado", () => {
    const usage = { ...EMPTY_USAGE, users: 8, processes: 490, clients: 99999, storageBytes: 7.4 * 1024 * MB, whatsappMonth: 1200 }
    const alerts = usageAlerts(usage, limits)
    assert.deepEqual(
      alerts.map((a) => a.key),
      ["whatsapp", "ai", "processes", "users"],
    )
    assert.equal(alerts[0].level, "exceeded")
    assert.ok(!alerts.some((a) => a.key === "clients" || a.key === "storage"))
  })
})

describe("formatação", () => {
  it("bytes e limites na unidade do recurso", () => {
    assert.equal(formatBytes(0), "0 MB")
    assert.equal(formatBytes(512 * 1024), "512 KB")
    assert.equal(formatBytes(7.4 * 1024 * MB), "7,4 GB")
    assert.equal(formatLimitValue("storage", 10240), "10 GB")
    assert.equal(formatLimitValue("users", null), "Ilimitado")
    assert.equal(formatLimitValue("processes", 1500), "1.500")
  })

  it("plano anual vira receita mensal equivalente", () => {
    assert.equal(monthlyCents({ priceCents: 120000, interval: "year" }), 10000)
    assert.equal(monthlyCents({ priceCents: 14990, interval: "month" }), 14990)
  })

  it("crescimento sem base de comparação é null", () => {
    assert.equal(growth(5, 0), null)
    assert.equal(growth(0, 0), 0)
    assert.equal(growth(12, 10), 0.2)
  })

  it("recursos de plano: só conhecidos, na ordem do catálogo", () => {
    assert.deepEqual(sanitizeFeatures(["ai", "root", "clients"]), ["clients", "ai"])
    assert.deepEqual(sanitizeFeatures("clients"), [])
  })
})

describe("períodos", () => {
  const now = new Date("2026-09-28T15:00:00")

  it("7 dias começa à meia-noite de 6 dias atrás", () => {
    const r = resolvePeriod("7d", now)
    assert.equal(r.from.getDate(), 22)
    assert.equal(r.from.getHours(), 0)
    assert.equal(r.to, now)
  })

  it("personalizado inclui o último dia e rejeita intervalos inválidos", () => {
    const r = resolvePeriod("custom", now, { from: "2026-09-01", to: "2026-09-10" })
    assert.equal(r.key, "custom")
    assert.equal((r.to.getTime() - r.from.getTime()) / 86_400_000, 10)
    assert.equal(resolvePeriod("custom", now, { from: "2026-09-10", to: "2026-09-01" }).key, "30d")
    assert.equal(resolvePeriod("qualquer", now).key, "30d")
  })

  it("parseRange recusa intervalo invertido ou maior que um ano", () => {
    const fallback = parseRange("2026-09-10T00:00:00Z", "2026-09-01T00:00:00Z", now)
    assert.equal(Math.round((fallback.to.getTime() - fallback.from.getTime()) / 86_400_000), 30)
    const huge = parseRange("2020-01-01T00:00:00Z", "2026-01-01T00:00:00Z", now)
    assert.equal(Math.round((huge.to.getTime() - huge.from.getTime()) / 86_400_000), 30)
    const ok = parseRange("2026-09-01T00:00:00Z", "2026-09-08T00:00:00Z", now)
    assert.equal(ok.from.toISOString(), "2026-09-01T00:00:00.000Z")
  })
})

describe("configurações", () => {
  it("completa com os padrões e descarta o desconhecido", () => {
    assert.deepEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS)
    const s = sanitizeSettings({ general: { trialDays: "400", usageWarningPercent: 10, publicSignup: "sim" }, evil: true, ai: { provider: "desconhecido" } })
    assert.equal(s.general.trialDays, 365)
    assert.equal(s.general.usageWarningPercent, 50)
    assert.equal(s.general.publicSignup, true)
    assert.equal(s.ai.provider, "anthropic")
    assert.ok(!("evil" in s))
  })

  it("limites padrão aceitam ilimitado", () => {
    const s = sanitizeSettings({ defaultLimits: { users: null, processes: "20" } })
    assert.equal(s.defaultLimits.users, null)
    assert.equal(s.defaultLimits.processes, 20)
  })
})

describe("pendências", () => {
  const plan = (name: string, priceCents: number): AdminPlan => ({
    id: name,
    name,
    description: "",
    priceCents,
    currency: "BRL",
    interval: "month",
    limits,
    features: [],
    status: "active",
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    organizations: 0,
  })
  const org = (patch: Partial<AdminOrganization>): AdminOrganization =>
    ({
      id: patch.name ?? "x",
      name: "x",
      status: "active",
      plan: "Essencial",
      alerts: [],
      subscription: null,
      ...patch,
    }) as AdminOrganization

  it("ordena por urgência e aponta para a ação", () => {
    const now = new Date("2026-09-28T12:00:00Z")
    const items = attentionItems(
      [
        org({ name: "A", status: "pending" }),
        org({ name: "B", subscription: { status: "past_due", gateway: "manual", createdAt: "" } }),
        org({ name: "C", alerts: [{ key: "users", used: 9, limit: 10, ratio: 0.9, level: "warning" }] }),
        org({ name: "D", subscription: { status: "trialing", trialEndsAt: "2026-10-01T00:00:00Z", gateway: "manual", createdAt: "" } }),
        org({ name: "E", status: "inactive", subscription: { status: "past_due", gateway: "manual", createdAt: "" } }),
      ],
      [plan("Essencial", 0), plan("Pro", 9900)],
      now,
    )
    assert.deepEqual(
      items.map((i) => i.kind),
      ["past_due", "pending", "limit", "trial_ending", "unpriced"],
    )
    assert.equal(items[0].count, 1, "inativo não conta como inadimplente")
    assert.equal(items.find((i) => i.kind === "pending")?.href, "/admin/escritorios?status=pending")
  })

  it("rótulos de limite existem para todas as chaves", () => {
    assert.ok(LIMIT_KEYS.every((k) => LIMIT_META[k].label))
  })
})

describe("migração 0002", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0002_lexa_admin.sql", import.meta.url), "utf8")

  it("tabelas administrativas têm RLS e nenhum acesso do navegador", () => {
    for (const table of ["subscriptions", "payments", "audit_logs", "usage_events", "platform_settings"]) {
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table)
      assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`), table)
      assert.doesNotMatch(sql, new RegExp(`create policy \\w+ on public\\.${table}`), `${table} não deve ter política`)
    }
  })

  it("funções de agregação não são executáveis pelo navegador", () => {
    for (const fn of ["admin_org_usage", "admin_activity_series", "admin_user_access"]) {
      assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`), fn)
    }
  })

  it("colunas de limite do banco batem com o catálogo", () => {
    for (const k of LIMIT_KEYS) assert.match(sql, new RegExp(`\\b${LIMIT_META[k].column}\\b`), k)
  })
})
