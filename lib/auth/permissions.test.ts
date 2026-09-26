import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { ALL_PERMISSIONS, effectivePermissions, hasPermission, ROLE_DEFAULTS, sanitizePermissions, type Role } from "./permissions"

const migrations = new URL("../../supabase/migrations/", import.meta.url)
/** Todas as migrações, na ordem em que rodam: vale a última definição de `role_defaults`. */
const sql = readdirSync(migrations)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(new URL(file, migrations), "utf8"))
  .join("\n")

/** Lê a lista de `role_defaults` de um papel direto das migrações (a definição mais recente). */
function sqlDefaults(role: Role): string[] {
  const matches = [...sql.matchAll(new RegExp(`when '${role}' then array\\[([^\\]]*)\\]`, "g"))]
  assert.ok(matches.length, `role_defaults sem o papel ${role}`)
  return [...matches.at(-1)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
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
