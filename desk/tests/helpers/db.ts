import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { drizzle as drizzlePglite } from "drizzle-orm/pglite"
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator"
import { afterAll, beforeAll, beforeEach } from "vitest"
import { MIGRATIONS_FOLDER, setDbForTesting, type Db } from "@/lib/db/client"
import * as schema from "@/lib/db/schema"

/**
 * Banco PostgreSQL de verdade com as mesmas migrações da aplicação. Por padrão, um PGlite em
 * memória; com `TEST_DATABASE_URL`, o servidor indicado (o banco é esvaziado a cada teste!).
 */
export function setupTestDb() {
  const state: { db?: Db; close?: () => Promise<void> } = {}
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL
    if (url) {
      const { Pool } = await import("pg")
      const { drizzle } = await import("drizzle-orm/node-postgres")
      const { migrate } = await import("drizzle-orm/node-postgres/migrator")
      const pool = new Pool({ connectionString: url, max: 4 })
      const db = drizzle(pool, { schema })
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
      state.db = db as unknown as Db
      state.close = () => pool.end()
    } else {
      const client = new PGlite()
      const db = drizzlePglite(client, { schema })
      await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER })
      state.db = db as unknown as Db
      state.close = () => client.close()
    }
    setDbForTesting(state.db)
  })
  beforeEach(async () => {
    await state.db!.execute(
      sql`truncate table board_connections, board_elements, boards, content_links, journal_entries, pages, task_tags, tags, subtasks, tasks, projects, areas, inbox_items, settings restart identity cascade`,
    )
  })
  afterAll(async () => {
    setDbForTesting(undefined)
    await state.close?.()
  })
  return state
}
