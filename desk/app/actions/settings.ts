"use server"

import { cookies } from "next/headers"
import { runAction } from "@/lib/actions"
import { TZ_COOKIE } from "@/lib/context"
import { isValidTimeZone } from "@/lib/domain/dates"
import * as settings from "@/lib/services/settings"

export async function updateSettingsAction(input: Parameters<typeof settings.updateSettings>[0]) {
  return runAction(() => settings.updateSettings(input))
}

/** O navegador informa o próprio fuso; usado quando não há fuso fixo nas configurações. */
export async function reportTimezoneAction(timezone: string) {
  return runAction(async () => {
    if (!isValidTimeZone(timezone)) return
    const store = await cookies()
    store.set(TZ_COOKIE, timezone, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" })
  })
}
