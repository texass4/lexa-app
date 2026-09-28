/**
 * Rótulos de tela para valores que a fonte informa em código.
 * Compartilhado por servidor e navegador.
 */

import type { DataOrigin } from "@/types"

const DEGREES: Record<string, string> = {
  G1: "1º grau",
  G2: "2º grau",
  JE: "Juizado Especial",
  TR: "Turma Recursal",
  TRU: "Turma Regional de Uniformização",
  TNU: "Turma Nacional de Uniformização",
  SUP: "Tribunal Superior",
  ORIGINARIO: "Originário",
}

/** "G1" → "1º grau". Valor desconhecido passa como veio. */
export const degreeLabel = (degree?: string) => (degree ? (DEGREES[degree.trim().toUpperCase()] ?? degree) : undefined)

/** Origem do dado, sem expor o fornecedor da consulta. */
export const ORIGIN_LABEL: Record<DataOrigin, string> = {
  datajud: "Consulta automática",
  manual: "Cadastro manual",
}

/** O processo é acompanhado pela consulta automática? */
export const isAutoTracked = (origin?: DataOrigin) => !!origin && origin !== "manual"
