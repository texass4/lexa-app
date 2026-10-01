"use client"

import * as React from "react"
import { Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from "lucide-react"
import { useSession } from "@/lib/auth/session"

/**
 * Clima atual na cidade do escritório (Configurações › Escritório). Dados públicos do
 * Open-Meteo (sem chave; só o nome da cidade sai do navegador). Sem cidade, sem
 * resposta ou com erro, o bloco simplesmente não aparece — nunca um valor inventado.
 */

interface Weather {
  temperature: number
  code: number
  isDay: boolean
}

const CACHE_MS = 30 * 60 * 1000
const cacheKey = (city: string) => `lexa:weather:${city}`

function WeatherIcon({ code, isDay }: Weather) {
  const cls = "size-7 shrink-0 text-gold"
  if (code === 0) return isDay ? <Sun className={cls} strokeWidth={1.6} aria-hidden /> : <Moon className={cls} strokeWidth={1.6} aria-hidden />
  if (code <= 2)
    return isDay ? <CloudSun className={cls} strokeWidth={1.6} aria-hidden /> : <CloudMoon className={cls} strokeWidth={1.6} aria-hidden />
  if (code === 3) return <Cloud className={cls} strokeWidth={1.6} aria-hidden />
  if (code === 45 || code === 48) return <CloudFog className={cls} strokeWidth={1.6} aria-hidden />
  if (code >= 95) return <CloudLightning className={cls} strokeWidth={1.6} aria-hidden />
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className={cls} strokeWidth={1.6} aria-hidden />
  return <CloudRain className={cls} strokeWidth={1.6} aria-hidden />
}

function readCache(city: string): Weather | null {
  if (!city) return null
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey(city)) ?? "null") as { at: number; weather: Weather } | null
    return cached && Date.now() - cached.at < CACHE_MS ? cached.weather : null
  } catch {
    return null
  }
}

async function loadWeather(city: string, signal: AbortSignal): Promise<Weather | null> {
  const name = city.split(/[,/-]/)[0].trim()
  if (!name) return null
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt&countryCode=BR`, {
    signal,
  }).then((r) => (r.ok ? r.json() : null))
  const place = geo?.results?.[0]
  if (!place) return null
  const data = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,is_day&timezone=auto`,
    { signal },
  ).then((r) => (r.ok ? r.json() : null))
  const current = data?.current
  if (typeof current?.temperature_2m !== "number") return null
  return { temperature: Math.round(current.temperature_2m), code: Number(current.weather_code ?? 3), isDay: current.is_day !== 0 }
}

export function WeatherChip() {
  const { organization } = useSession()
  const city = organization.city?.trim() ?? ""
  // O Painel só aparece depois da hidratação: ler o cache aqui não diverge do servidor.
  const [weather, setWeather] = React.useState<Weather | null>(() => readCache(city))

  React.useEffect(() => {
    if (!city || readCache(city)) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 6000)
    loadWeather(city, controller.signal)
      .then((result) => {
        if (!result) return
        setWeather(result)
        try {
          sessionStorage.setItem(cacheKey(city), JSON.stringify({ at: Date.now(), weather: result }))
        } catch {
          // Cache é só conveniência.
        }
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timer))
    return () => controller.abort()
  }, [city])

  if (!weather) return null
  return (
    <div className="flex items-center gap-2.5 pr-1" title="Clima agora (Open-Meteo)">
      <WeatherIcon {...weather} />
      <div className="leading-tight">
        <p className="tabular text-[15px] font-semibold text-foreground">{weather.temperature}°C</p>
        <p className="max-w-[160px] truncate text-[12.5px] text-muted-foreground">{city}</p>
      </div>
    </div>
  )
}
