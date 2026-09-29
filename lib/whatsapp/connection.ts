import type { InstanceInfo } from "./client"

/**
 * Estado da conexão do WhatsApp do escritório, a partir de `GET /api/whatsapp/instance`.
 * Mesma leitura na Central de Atendimento e em Configurações › Integrações.
 */
export type ConnectionHealth = "loading" | "connected" | "disconnected" | "unconfigured" | "error"

export function connectionHealth(info: InstanceInfo | null, loading: boolean): ConnectionHealth {
  if (loading && !info) return "loading"
  if (!info?.instance) return "unconfigured"
  if (info.live?.error) return "error"
  return info.instance.status === "connected" ? "connected" : "disconnected"
}

export const CONNECTION_LABEL: Record<ConnectionHealth, string> = {
  loading: "Verificando conexão…",
  connected: "WhatsApp conectado",
  disconnected: "WhatsApp desconectado",
  unconfigured: "WhatsApp não configurado",
  error: "Z-API indisponível",
}

/** O que cada estado significa para quem usa — sem o caso "conectado". */
export function connectionProblem(health: Exclude<ConnectionHealth, "connected" | "loading">, info: InstanceInfo | null) {
  if (health === "unconfigured") return "O WhatsApp do escritório ainda não foi configurado. Você pode ler o histórico, mas o envio está desativado."
  if (health === "error") return info?.live?.error ?? "Não foi possível falar com a Z-API."
  return "O WhatsApp do escritório está desconectado. Mensagens novas não chegam nem saem até reconectar."
}
