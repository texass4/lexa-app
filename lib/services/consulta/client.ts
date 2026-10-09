"use client"

/**
 * Acesso do navegador à Consulta processual. A tela recebe a execução (etapas,
 * fontes, relatório) ou uma mensagem pronta — nunca detalhe técnico.
 */

import { publicMessage } from "@/lib/core/public-error"
import type { EnrichmentRun } from "./types"

const GENERIC = "Não foi possível concluir agora. Tente novamente em instantes."
const OFFLINE = "Sem conexão com a internet. Verifique sua conexão e tente novamente."

export type ConsultaFailure = { ok: false; code: string; message: string }

async function call<T>(url: string, init?: RequestInit): Promise<({ ok: true } & T) | ConsultaFailure> {
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" })
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return { ok: false, code: "ABORTED", message: "Cancelado." }
    return { ok: false, code: "OFFLINE", message: OFFLINE }
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null
  if (!response.ok || !data) return { ok: false, code: data?.error?.code ?? "UNEXPECTED", message: publicMessage(data?.error?.message, GENERIC) }
  return { ok: true, ...data }
}

/** Inicia (ou reaproveita) uma consulta. */
export const startConsulta = (input: { processId?: string; cnj?: string; force?: boolean }) =>
  call<{ runId: string; reused: "recent" | "running" | false }>("/api/process-enrichment", { method: "POST", body: JSON.stringify(input) })

export const fetchRun = (id: string, signal?: AbortSignal) => call<{ run: EnrichmentRun }>(`/api/process-enrichment/${encodeURIComponent(id)}`, { signal })

export const fetchLatestRun = (processId: string, signal?: AbortSignal) =>
  call<{ run: EnrichmentRun | null }>(`/api/process-enrichment?processId=${encodeURIComponent(processId)}`, { signal })

export const consultaHref = (runId: string) => `/processos/consulta?execucao=${encodeURIComponent(runId)}`
