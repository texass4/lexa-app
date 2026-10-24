import "server-only"
import { cookies } from "next/headers"
import { hourIn, isValidTimeZone, todayIn, type LocalDate } from "@/lib/domain/dates"
import { getSettings } from "@/lib/services/settings"

export const TZ_COOKIE = "mesa_tz"
const FALLBACK_TZ = process.env.DESK_DEFAULT_TIMEZONE && isValidTimeZone(process.env.DESK_DEFAULT_TIMEZONE) ? process.env.DESK_DEFAULT_TIMEZONE : "America/Sao_Paulo"

export type RequestContext = { timezone: string; today: LocalDate; hour: number; weekStartsOn: number; ownerName: string; timezoneSource: "settings" | "browser" | "default" }

/**
 * Fuso e data local de quem está usando: o fuso salvo nas configurações ou, sem ele, o que o
 * navegador informou no cookie `mesa_tz`. "Hoje" e "atrasada" sempre partem daqui.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const [settings, store] = await Promise.all([getSettings(), cookies()])
  const browserTz = store.get(TZ_COOKIE)?.value
  let timezone = FALLBACK_TZ
  let timezoneSource: RequestContext["timezoneSource"] = "default"
  if (settings.timezone && isValidTimeZone(settings.timezone)) {
    timezone = settings.timezone
    timezoneSource = "settings"
  } else if (browserTz && isValidTimeZone(browserTz)) {
    timezone = browserTz
    timezoneSource = "browser"
  }
  const now = new Date()
  return { timezone, today: todayIn(timezone, now), hour: hourIn(timezone, now), weekStartsOn: settings.weekStartsOn, ownerName: settings.ownerName, timezoneSource }
}
