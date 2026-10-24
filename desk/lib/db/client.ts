import path from "node:path"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import * as schema from "./schema"

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
/** Serviços aceitam o banco ou uma transação aberta. */
export type Executor = Db | Tx

type Holder = { db?: Promise<Db>; override?: Db; close?: () => Promise<void> }

// Sobrevive ao recarregamento de módulos do `next dev` (uma conexão por processo).
const holder: Holder = ((globalThis as { __mesaDb?: Holder }).__mesaDb ??= {})

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle")

/**
 * Banco da Mesa. Com `DATABASE_URL`, um PostgreSQL de verdade (local, Supabase, Neon…).
 * Sem ela, um PostgreSQL embutido (PGlite) gravado em `DESK_DATA_DIR` — prático para usar
 * na própria máquina sem instalar nada; os dados continuam em disco, não no navegador.
 */
export function getDb(): Promise<Db> {
  if (holder.override) return Promise.resolve(holder.override)
  holder.db ??= connect().catch((error) => {
    holder.db = undefined
    throw error
  })
  return holder.db
}

async function connect(): Promise<Db> {
  const autoMigrate = process.env.DESK_AUTO_MIGRATE !== "false"
  const url = process.env.DATABASE_URL

  if (url) {
    const { Pool } = await import("pg")
    const { drizzle } = await import("drizzle-orm/node-postgres")
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5) })
    const db = drizzle(pool, { schema })
    if (autoMigrate) {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator")
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    }
    holder.close = () => pool.end()
    return db as unknown as Db
  }

  if (process.env.NODE_ENV === "production" && process.env.DESK_ALLOW_EMBEDDED_DB !== "true") {
    throw new Error("DATABASE_URL não configurada. Em produção, use um PostgreSQL (ou defina DESK_ALLOW_EMBEDDED_DB=true para o banco embutido).")
  }

  const { PGlite } = await import("@electric-sql/pglite")
  const { drizzle } = await import("drizzle-orm/pglite")
  const dataDir = path.resolve(process.env.DESK_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite"))
  const client = new PGlite(dataDir)
  const db = drizzle(client, { schema })
  // O banco embutido sempre recebe as migrações: não há outro processo para aplicá-las.
  const { migrate } = await import("drizzle-orm/pglite/migrator")
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  holder.close = () => client.close()
  return db as unknown as Db
}

/** Testes: usa um banco já pronto (ex.: PGlite em memória). */
export function setDbForTesting(db: Db | undefined) {
  holder.override = db
}

export async function closeDb() {
  await holder.close?.()
  holder.db = undefined
  holder.close = undefined
}
