/**
 * DADOS SIMULADOS — cenários de identificação do tribunal (origem × atual).
 *
 * Nada aqui é resultado real de consulta: números CNJ sintéticos (dígito verificador
 * calculado por `syntheticCNJ`) e respostas montadas à mão no formato da API pública
 * do DataJud (envelope com `hits` e `_source`), só para exercitar as regras.
 */

import type { DataJudHit, DataJudRawMovement, DataJudSearchResponse } from "../mapper"

/** Número CNJ SINTÉTICO com dígito verificador válido (ISO 7064 MOD 97-10). */
export function syntheticCNJ(segment: string, tribunal: string, { sequence = "1234567", year = "2021", unit = "0100" } = {}) {
  const base = `${sequence}${year}${segment}${tribunal}${unit}00`
  let remainder = 0
  for (const digit of base) remainder = (remainder * 10 + Number(digit)) % 97
  const check = 98 - remainder
  return `${sequence}${String(check).padStart(2, "0")}${year}${segment}${tribunal}${unit}`
}

/** Mesmo número com o dígito verificador trocado (inválido). */
export const withWrongCheckDigits = (cnj: string) => `${cnj.slice(0, 7)}${String((Number(cnj.slice(7, 9)) + 1) % 100).padStart(2, "0")}${cnj.slice(9)}`

export const SIM_TJSP = syntheticCNJ("8", "26")
export const SIM_TRF1 = syntheticCNJ("4", "01")
export const SIM_TRT2 = syntheticCNJ("5", "02")
export const SIM_TRE_SP = syntheticCNJ("6", "26")
export const SIM_TJMMG = syntheticCNJ("9", "13")
export const SIM_STF = syntheticCNJ("1", "00")
export const SIM_UNKNOWN = syntheticCNJ("8", "99")

const movement = (nome: string, dataHora: string, codigo?: number, extra: Partial<DataJudRawMovement> = {}): DataJudRawMovement => ({ codigo, nome, dataHora, ...extra })

interface SimHit {
  index: string
  tribunal?: string
  grau?: string
  orgao?: string
  updatedAt?: string
  movimentos?: DataJudRawMovement[]
}

/** Resposta SIMULADA com os documentos informados. */
export function simulatedResponse(cnj: string, hits: SimHit[]): DataJudSearchResponse {
  return {
    took: 1,
    timed_out: false,
    hits: {
      total: { value: hits.length },
      hits: hits.map(
        (h, i): DataJudHit => ({
          _index: h.index,
          _id: `SIMULADO_${i}`,
          _source: {
            numeroProcesso: cnj,
            tribunal: h.tribunal,
            grau: h.grau,
            classe: { codigo: 7, nome: "Procedimento Comum Cível (simulado)" },
            orgaoJulgador: h.orgao ? { codigo: 1000 + i, nome: h.orgao } : undefined,
            dataHoraUltimaAtualizacao: h.updatedAt,
            movimentos: h.movimentos ?? [],
          },
        }),
      ),
    },
  }
}

/** TJSP, só 1º grau, última movimentação comum (despacho). */
export const simTjspFirstDegree = simulatedResponse(SIM_TJSP, [
  {
    index: "api_publica_tjsp",
    tribunal: "TJSP",
    grau: "G1",
    orgao: "1ª Vara Cível (simulada)",
    updatedAt: "2026-09-20T10:00:00.000Z",
    movimentos: [movement("Mero expediente", "2026-09-18T14:00:00.000Z", 11010), movement("Distribuição", "2021-03-01T09:00:00.000Z", 26)],
  },
])

/** TJSP com 1º e 2º grau (apelação) — o mais recente é o 2º grau. */
export const simTjspTwoDegrees = simulatedResponse(SIM_TJSP, [
  {
    index: "api_publica_tjsp",
    tribunal: "TJSP",
    grau: "G1",
    orgao: "1ª Vara Cível (simulada)",
    updatedAt: "2025-05-10T10:00:00.000Z",
    movimentos: [movement("Juntada de Petição", "2025-05-09T10:00:00.000Z", 85)],
  },
  {
    index: "api_publica_tjsp",
    tribunal: "TJSP",
    grau: "G2",
    orgao: "10ª Câmara de Direito Privado (simulada)",
    updatedAt: "2026-08-01T10:00:00.000Z",
    movimentos: [movement("Conclusão", "2026-07-30T10:00:00.000Z", 51)],
  },
])

/** Última movimentação é remessa (ex.: subida a tribunal superior). */
export const simTjspRemessa = simulatedResponse(SIM_TJSP, [
  {
    index: "api_publica_tjsp",
    tribunal: "TJSP",
    grau: "G2",
    updatedAt: "2026-08-01T10:00:00.000Z",
    movimentos: [movement("Remessa", "2026-07-31T10:00:00.000Z", 123), movement("Conclusão", "2026-06-01T10:00:00.000Z", 51)],
  },
])

/** Última movimentação é baixa definitiva. */
export const simTjspBaixa = simulatedResponse(SIM_TJSP, [
  {
    index: "api_publica_tjsp",
    tribunal: "TJSP",
    grau: "G1",
    updatedAt: "2026-08-01T10:00:00.000Z",
    movimentos: [movement("Baixa Definitiva", "2026-07-31T10:00:00.000Z", 22)],
  },
])

/** Registro sem o campo `tribunal` (resposta incompleta). */
export const simMissingTribunal = simulatedResponse(SIM_TJSP, [
  { index: "api_publica_tjsp", grau: "G1", updatedAt: "2026-09-20T10:00:00.000Z", movimentos: [movement("Mero expediente", "2026-09-18T14:00:00.000Z")] },
])

/** Registro sem data de atualização na fonte. */
export const simMissingUpdatedAt = simulatedResponse(SIM_TJSP, [
  { index: "api_publica_tjsp", tribunal: "TJSP", grau: "G1", movimentos: [movement("Mero expediente", "2026-09-18T14:00:00.000Z")] },
])

/** Registro sem nenhuma movimentação. */
export const simNoMovements = simulatedResponse(SIM_TJSP, [{ index: "api_publica_tjsp", tribunal: "TJSP", grau: "G1", updatedAt: "2026-09-20T10:00:00.000Z" }])

/** Índice do TJSP com registro que se diz de outro tribunal (contradição). */
export const simMismatchedTribunal = simulatedResponse(SIM_TJSP, [
  { index: "api_publica_tjsp", tribunal: "TJRJ", grau: "G1", updatedAt: "2026-09-20T10:00:00.000Z", movimentos: [movement("Mero expediente", "2026-09-18T14:00:00.000Z")] },
])

/** Registro do mesmo número no índice do STJ (recurso especial). */
export const simStjRecord = simulatedResponse(SIM_TJSP, [
  {
    index: "api_publica_stj",
    tribunal: "STJ",
    grau: "SUP",
    orgao: "Terceira Turma (simulada)",
    updatedAt: "2026-09-25T10:00:00.000Z",
    movimentos: [movement("Conclusão", "2026-09-24T10:00:00.000Z", 51)],
  },
])

/** TJ do Distrito Federal com a grafia "TJDF" no registro. */
export const SIM_TJDFT = syntheticCNJ("8", "07")
export const simTjdftAlias = simulatedResponse(SIM_TJDFT, [
  { index: "api_publica_tjdft", tribunal: "TJDF", grau: "G1", updatedAt: "2026-09-20T10:00:00.000Z", movimentos: [movement("Mero expediente", "2026-09-18T14:00:00.000Z")] },
])

export const simEmpty: DataJudSearchResponse = { took: 1, timed_out: false, hits: { total: { value: 0 }, hits: [] } }
