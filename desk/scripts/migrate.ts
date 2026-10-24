// Aplica as migrações em drizzle/ no banco de DATABASE_URL (ou no PGlite de DESK_DATA_DIR).
import path from "node:path"

const folder = path.join(process.cwd(), "drizzle")
const url = process.env.DATABASE_URL

if (url) {
  const { Pool } = await import("pg")
  const { drizzle } = await import("drizzle-orm/node-postgres")
  const { migrate } = await import("drizzle-orm/node-postgres/migrator")
  const pool = new Pool({ connectionString: url })
  await migrate(drizzle(pool), { migrationsFolder: folder })
  await pool.end()
  console.log("Migrações aplicadas no PostgreSQL de DATABASE_URL.")
} else {
  const { PGlite } = await import("@electric-sql/pglite")
  const { drizzle } = await import("drizzle-orm/pglite")
  const { migrate } = await import("drizzle-orm/pglite/migrator")
  const dir = path.resolve(process.env.DESK_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite"))
  const client = new PGlite(dir)
  await migrate(drizzle(client), { migrationsFolder: folder })
  await client.close()
  console.log(`Migrações aplicadas no banco embutido em ${dir}.`)
}
