import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { ALL_PERMISSIONS, effectivePermissions, hasPermission, ROLE_DEFAULTS, sanitizePermissions, type Role } from "./permissions"

const sql = readFileSync(new URL("../../supabase/migrations/0001_lexa_auth.sql", import.meta.url), "utf8")

/** Lê a lista de `role_defaults` de um papel direto da migração. */
function sqlDefaults(role: Role): string[] {
  const match = sql.match(new RegExp(`when '${role}' then array\\[([^\\]]*)\\]`))
  assert.ok(match, `role_defaults sem o papel ${role}`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
}

describe("permissões", () => {
  it("os padrões por papel batem com a migração do banco", () => {
    for (const role of ["owner", "lawyer", "staff"] as const) {
      assert.deepEqual([...ROLE_DEFAULTS[role]].sort(), sqlDefaults(role), role)
    }
  })

  it("sócio tem tudo, mesmo com lista personalizada", () => {
    assert.deepEqual(effectivePermissions("owner", ["clients.view"]), ALL_PERMISSIONS)
  })

  it("lista personalizada substitui o padrão do papel", () => {
    const profile = { role: "staff" as const, permissions: ["clients.view"], active: true }
    assert.equal(hasPermission(profile, "clients.view"), true)
    assert.equal(hasPermission(profile, "clients.edit"), false)
    assert.equal(hasPermission(profile, "tasks.view"), false)
  })

  it("sem lista, vale o padrão do papel", () => {
    assert.equal(hasPermission({ role: "lawyer", active: true }, "finance.view"), true)
    assert.equal(hasPermission({ role: "lawyer", active: true }, "finance.edit"), false)
    assert.equal(hasPermission({ role: "staff", active: true }, "finance.view"), false)
  })

  it("usuário inativo e super admin não têm permissão em dados do escritório", () => {
    assert.equal(hasPermission({ role: "owner", active: false }, "clients.view"), false)
    assert.equal(hasPermission({ role: "super_admin", active: true }, "clients.view"), false)
  })

  it("descarta permissões desconhecidas", () => {
    assert.deepEqual(sanitizePermissions(["clients.view", "root.all", "clients.view"]), ["clients.view"])
  })
})
