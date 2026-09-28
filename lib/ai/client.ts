/**
 * Acesso do navegador à LEXA IA — só `fetch` para as rotas `/api/ai/*`.
 * Nenhum SDK de IA, nenhuma chave: tudo o que fala com o modelo roda no servidor.
 */

import type {
  AIMessage,
  AIResult,
  AIStatus,
  ChatReply,
  ChatScope,
  ClientSummary,
  MovementAnalysis,
  NextActions,
  OfficeOverviewResult,
  ProcessSummary,
} from "./types"

export class AIRequestError extends Error {
  readonly code: string
  readonly retryAfter?: number

  constructor(code: string, message: string, retryAfter?: number) {
    super(message)
    this.name = "AIRequestError"
    this.code = code
    this.retryAfter = retryAfter
  }
}

const OFFLINE = "Sem conexão com o LEXA. Verifique sua internet e tente de novo."
const GENERIC = "Não foi possível concluir a análise agora. Tente novamente."

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal })
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw new AIRequestError("CANCELLED", "Análise cancelada.")
    throw new AIRequestError("OFFLINE", OFFLINE)
  }

  const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string; retryAfter?: number } | string } | null
  if (!response.ok) {
    const error = typeof payload?.error === "object" ? payload.error : undefined
    throw new AIRequestError(error?.code ?? "UNEXPECTED", error?.message ?? GENERIC, error?.retryAfter)
  }
  if (!payload) throw new AIRequestError("UNEXPECTED", GENERIC)
  return payload as T
}

export const aiApi = {
  processSummary: (processId: string, signal?: AbortSignal) => post<AIResult<ProcessSummary>>("/api/ai/process/summary", { processId }, signal),
  analyzeMovement: (processId: string, movementId: string, signal?: AbortSignal) =>
    post<AIResult<MovementAnalysis>>("/api/ai/process/analyze-movement", { processId, movementId }, signal),
  nextActions: (processId: string, signal?: AbortSignal) => post<AIResult<NextActions>>("/api/ai/process/next-actions", { processId }, signal),
  clientSummary: (clientId: string, signal?: AbortSignal) => post<AIResult<ClientSummary>>("/api/ai/client/summary", { clientId }, signal),
  officeOverview: (signal?: AbortSignal) => post<OfficeOverviewResult>("/api/ai/office/overview", {}, signal),
  chat: (scope: ChatScope, messages: AIMessage[], signal?: AbortSignal) => post<AIResult<ChatReply>>("/api/ai/chat", { scope, messages }, signal),
}

let status: Promise<AIStatus> | undefined

/** Estado da IA, consultado uma vez por sessão (não chama o modelo). */
export function fetchAIStatus(): Promise<AIStatus> {
  status ??= fetch("/api/ai/status")
    .then((response) => (response.ok ? (response.json() as Promise<AIStatus>) : { enabled: true, configured: true }))
    // Sem resposta, deixa tentar: a própria ação mostra o erro certo.
    .catch(() => {
      status = undefined
      return { enabled: true, configured: true }
    })
  return status
}
