/**
 * Quais fontes de jurisprudência estão ligadas (variáveis do servidor). Sem
 * `JURISPRUDENCIA_FONTES`, nada é sincronizado e a tela mostra "Pesquisa de
 * jurisprudência ainda não configurada." — nunca decisões de exemplo.
 */

import { createStjSource, STJ_LABEL } from "./sources/stj"
import type { JurisprudenceProviderId, JurisprudenceSource } from "./types"

const KNOWN: JurisprudenceProviderId[] = ["stj"]

/** O que a tela pode mostrar sobre cada fonte (sem nada técnico). */
export const SOURCE_INFO: Record<JurisprudenceProviderId, { label: string; tribunal: string; url: string; license: string }> = {
  stj: {
    label: STJ_LABEL,
    tribunal: "STJ",
    url: "https://dadosabertos.web.stj.jus.br/group/jurisprudencia",
    license: "Creative Commons Atribuição (CC-BY)",
  },
}

const int = (value: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

export function jurisprudenceConfig(env: Record<string, string | undefined> = process.env) {
  const sources = list(env.JURISPRUDENCIA_FONTES).filter((id): id is JurisprudenceProviderId => KNOWN.includes(id as JurisprudenceProviderId))
  return {
    enabled: sources.length > 0,
    sources,
    stj: {
      baseUrl: env.JURISPRUDENCIA_STJ_BASE_URL?.trim() || undefined,
      datasets: list(env.JURISPRUDENCIA_STJ_CONJUNTOS),
      /** Primeira leitura de um conjunto: só os N arquivos mensais mais recentes. */
      initialFiles: int(env.JURISPRUDENCIA_STJ_ARQUIVOS_INICIAIS, 3, 1, 24),
      /** Downloads por execução do agendador. */
      filesPerRun: int(env.JURISPRUDENCIA_STJ_ARQUIVOS_POR_EXECUCAO, 2, 1, 10),
    },
  }
}

export type JurisprudenceConfig = ReturnType<typeof jurisprudenceConfig>

/** Fontes ligadas, prontas para a sincronização (somente servidor). */
export function configuredSources(config: JurisprudenceConfig = jurisprudenceConfig()): JurisprudenceSource[] {
  if (typeof window !== "undefined") throw new Error("A sincronização de jurisprudência só roda no servidor.")
  return config.sources.map((id) => {
    switch (id) {
      case "stj":
        return createStjSource({
          baseUrl: config.stj.baseUrl,
          datasets: config.stj.datasets,
          log: (event, fields) => {
            const line = `[jurisprudencia:stj] ${event} ${JSON.stringify(fields)}`
            if (event === "response" && fields.status === 200) console.info(line)
            else console.warn(line)
          },
        })
    }
  })
}
