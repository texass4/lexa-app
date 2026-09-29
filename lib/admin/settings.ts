/**
 * Configurações globais da Íntegra (`public.platform_settings`). O banco guarda só o que
 * foi alterado; `sanitizeSettings` completa com os padrões e descarta o que não é
 * conhecido — vale para o que vem do banco e para o que vem do formulário.
 *
 * Segredos (chaves de API de IA, WhatsApp, gateway) NUNCA ficam aqui: ficam nas
 * variáveis de ambiente do servidor.
 */

import { BRAND } from "@/lib/brand"
import { LIMIT_KEYS, type PlanLimits } from "./catalog"

export interface PlatformSettings {
  platform: { name: string; supportEmail: string; supportPhone: string; website: string }
  general: {
    /** Tela /cadastro aberta ao público. */
    publicSignup: boolean
    /** Cadastro público nasce "aguardando aprovação" (senão, já ativo). */
    requireApproval: boolean
    /** Plano de quem se cadastra. */
    defaultPlan: string
    /** Dias de teste de um escritório novo (0 = sem teste). */
    trialDays: number
    /** Bloqueia convites acima do limite de usuários do plano. */
    enforceUserLimits: boolean
    /** A partir de quantos % do limite o uso vira alerta. */
    usageWarningPercent: number
  }
  /**
   * `djen`: captura de intimações do DJEN. Desligada por padrão: a fonte (API pública do
   * CNJ) não publica termos de uso — ligar depois de confirmar que o uso comercial é permitido.
   */
  features: { datajud: boolean; whatsapp: boolean; ai: boolean; djen: boolean }
  ai: { provider: string; model: string }
  whatsapp: { provider: string; businessNumber: string }
  /** Sugeridos ao criar um plano novo. */
  defaultLimits: PlanLimits
  maintenance: { enabled: boolean; message: string }
  /** Registros de auditoria mais antigos que isso são apagados automaticamente. */
  admin: { auditRetentionDays: number }
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  platform: { name: BRAND.name, supportEmail: "", supportPhone: "", website: "" },
  general: {
    publicSignup: true,
    requireApproval: true,
    defaultPlan: "Essencial",
    trialDays: 14,
    enforceUserLimits: false,
    usageWarningPercent: 80,
  },
  features: { datajud: true, whatsapp: false, ai: false, djen: false },
  ai: { provider: "gemini", model: "" },
  whatsapp: { provider: "", businessNumber: "" },
  defaultLimits: { users: 5, processes: 1000, clients: 2000, storage: 10240, whatsapp: 2000, ai: 500 },
  maintenance: { enabled: false, message: "Estamos fazendo uma manutenção programada. Voltamos em instantes." },
  admin: { auditRetentionDays: 365 },
}

export const AI_PROVIDERS = [
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI" },
  { value: "other", label: "Outro" },
]

export const WHATSAPP_PROVIDERS = [
  { value: "", label: "Nenhum" },
  { value: "zapi", label: "Z-API" },
  { value: "meta", label: "WhatsApp Cloud API (Meta)" },
  { value: "twilio", label: "Twilio" },
  { value: "other", label: "Outro" },
]

type Shape = Record<string, unknown>

const str = (v: unknown, fallback: string, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback)
const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}
const obj = (v: unknown): Shape => (v && typeof v === "object" && !Array.isArray(v) ? (v as Shape) : {})
const oneOf = (v: unknown, list: { value: string }[], fallback: string) =>
  typeof v === "string" && list.some((o) => o.value === v) ? v : fallback

function limits(v: unknown, fallback: PlanLimits): PlanLimits {
  const input = obj(v)
  const out = { ...fallback }
  for (const key of LIMIT_KEYS) {
    if (!(key in input)) continue
    const raw = input[key]
    out[key] = raw === null || raw === "" ? null : int(raw, fallback[key] ?? 0, 0, 1_000_000_000)
  }
  return out
}

/** Configuração completa e válida a partir de qualquer entrada. */
export function sanitizeSettings(input: unknown): PlatformSettings {
  const d = DEFAULT_SETTINGS
  const s = obj(input)
  const platform = obj(s.platform)
  const general = obj(s.general)
  const features = obj(s.features)
  const ai = obj(s.ai)
  const whatsapp = obj(s.whatsapp)
  const maintenance = obj(s.maintenance)
  const admin = obj(s.admin)
  return {
    platform: {
      name: str(platform.name, d.platform.name, 60) || d.platform.name,
      supportEmail: str(platform.supportEmail, d.platform.supportEmail, 160),
      supportPhone: str(platform.supportPhone, d.platform.supportPhone, 40),
      website: str(platform.website, d.platform.website, 200),
    },
    general: {
      publicSignup: bool(general.publicSignup, d.general.publicSignup),
      requireApproval: bool(general.requireApproval, d.general.requireApproval),
      defaultPlan: str(general.defaultPlan, d.general.defaultPlan, 60) || d.general.defaultPlan,
      trialDays: int(general.trialDays, d.general.trialDays, 0, 365),
      enforceUserLimits: bool(general.enforceUserLimits, d.general.enforceUserLimits),
      usageWarningPercent: int(general.usageWarningPercent, d.general.usageWarningPercent, 50, 99),
    },
    features: {
      datajud: bool(features.datajud, d.features.datajud),
      whatsapp: bool(features.whatsapp, d.features.whatsapp),
      ai: bool(features.ai, d.features.ai),
      djen: bool(features.djen, d.features.djen),
    },
    ai: {
      provider: oneOf(ai.provider, AI_PROVIDERS, d.ai.provider),
      model: str(ai.model, d.ai.model, 80),
    },
    whatsapp: {
      provider: oneOf(whatsapp.provider, WHATSAPP_PROVIDERS, d.whatsapp.provider),
      businessNumber: str(whatsapp.businessNumber, d.whatsapp.businessNumber, 40),
    },
    defaultLimits: limits(s.defaultLimits, d.defaultLimits),
    maintenance: {
      enabled: bool(maintenance.enabled, d.maintenance.enabled),
      message: str(maintenance.message, d.maintenance.message, 500) || d.maintenance.message,
    },
    admin: {
      auditRetentionDays: int(admin.auditRetentionDays, d.admin.auditRetentionDays, 30, 3650),
    },
  }
}
