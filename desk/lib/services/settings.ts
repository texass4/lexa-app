import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { settings } from "@/lib/db/schema"
import { isValidTimeZone } from "@/lib/domain/dates"
import { settingsSchema } from "@/lib/validation"
import type { z } from "zod"
import { invalid } from "./errors"
import { defined, parse } from "./util"

export type Settings = { ownerName: string; timezone: string | null; weekStartsOn: number }

export async function getSettings(): Promise<Settings> {
  const db = await getDb()
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  return row ? { ownerName: row.ownerName, timezone: row.timezone, weekStartsOn: row.weekStartsOn } : { ownerName: "", timezone: null, weekStartsOn: 1 }
}

export async function updateSettings(input: z.input<typeof settingsSchema>) {
  const data = parse(settingsSchema, input)
  if (data.timezone && !isValidTimeZone(data.timezone)) throw invalid("Fuso horário desconhecido.")
  const db = await getDb()
  const values = { ...defined(data), timezone: data.timezone === "" ? null : data.timezone, updatedAt: new Date() }
  if (data.timezone === undefined) delete (values as { timezone?: unknown }).timezone
  await db
    .insert(settings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: settings.id, set: values })
  return getSettings()
}
