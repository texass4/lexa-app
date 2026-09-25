/**
 * Respostas de exemplo do DataJud usadas nos testes.
 *
 * Reproduzem o formato da API pública (envelope Elasticsearch com `hits` e
 * `_source`) para exercitar o mapper sem depender da rede. Os cenários cobrem
 * o que a fonte realmente costuma variar: processo com movimentações, processo
 * sem órgão julgador, resposta vazia e processo com partes — este último não é
 * garantido pela API pública, mas o mapper precisa suportar.
 */

import type { DataJudSearchResponse } from "../mapper"

/** Processo real usado nos testes manuais: 0000832-35.2018.4.01.3202. */
export const trf1Response: DataJudSearchResponse = {
  took: 12,
  timed_out: false,
  hits: {
    total: { value: 1 },
    hits: [
      {
        _index: "api_publica_trf1",
        _id: "TRF1_JE_3202_0000832352018401320",
        _source: {
          numeroProcesso: "00008323520184013202",
          id: "TRF1_JE_3202_0000832352018401320",
          tribunal: "TRF1",
          grau: "JE",
          classe: { codigo: 436, nome: "Procedimento do Juizado Especial Cível" },
          sistema: { codigo: 1, nome: "PJe" },
          formato: { codigo: 1, nome: "Eletrônico" },
          assuntos: [{ codigo: 6117, nome: "Concessão" }],
          orgaoJulgador: { codigo: 12420, nome: "Tefé", codigoMunicipioIBGE: 255 },
          dataAjuizamento: "2018-10-29T00:00:00.000Z",
          dataHoraUltimaAtualizacao: "2026-06-08T03:12:44.000Z",
          nivelSigilo: 0,
          movimentos: [
            {
              codigo: 11383,
              nome: "Ato ordinatório",
              dataHora: "2024-07-03T14:20:00.000Z",
              // Formato real: `descricao` é a chave técnica, `nome` o texto legível.
              complementosTabelados: [{ codigo: 2, valor: 7, nome: "Praticado", descricao: "tipo_de_ato" }],
            },
            { codigo: 26, nome: "Distribuição", dataHora: "2018-10-29T10:05:00.000Z" },
            { codigo: 51, nome: "Audiência designada", dataHora: "2019-03-11T09:00:00.000Z" },
          ],
        },
      },
    ],
  },
}

/** Mesmo número em dois graus: o mapper escolhe o mais recente. */
export const twoDegreesResponse: DataJudSearchResponse = {
  hits: {
    total: { value: 2 },
    hits: [
      {
        _index: "api_publica_trf1",
        _id: "grau-1",
        _source: {
          numeroProcesso: "00008323520184013202",
          tribunal: "TRF1",
          grau: "G1",
          dataHoraUltimaAtualizacao: "2023-01-10T10:00:00.000Z",
          movimentos: [{ codigo: 26, nome: "Distribuição", dataHora: "2018-10-29T10:05:00.000Z" }],
        },
      },
      {
        _index: "api_publica_trf1",
        _id: "grau-2",
        _source: {
          numeroProcesso: "00008323520184013202",
          tribunal: "TRF1",
          grau: "JE",
          dataHoraUltimaAtualizacao: "2026-06-08T03:12:44.000Z",
          movimentos: [
            { codigo: 11383, nome: "Ato ordinatório", dataHora: "2024-07-03T14:20:00.000Z" },
            { codigo: 26, nome: "Distribuição", dataHora: "2018-10-29T10:05:00.000Z" },
          ],
        },
      },
    ],
  },
}

/** Sem órgão julgador, sem assunto e com movimentação sem data. */
export const sparseResponse: DataJudSearchResponse = {
  hits: {
    total: { value: 1 },
    hits: [
      {
        _index: "api_publica_tjsp",
        _id: "esparso",
        _source: {
          numeroProcesso: "10027395220194013700",
          tribunal: "TJSP",
          movimentos: [
            { codigo: 60, nome: "Expedição de documento" },
            { codigo: 12, nome: "Conclusão", dataHora: "2025-02-02T08:00:00.000Z" },
          ],
        },
      },
    ],
  },
}

/** Fonte que devolve partes com polo explícito. */
export const withPartiesResponse: DataJudSearchResponse = {
  hits: {
    total: { value: 1 },
    hits: [
      {
        _index: "api_publica_trf1",
        _id: "com-partes",
        _source: {
          numeroProcesso: "00008323520184013202",
          tribunal: "TRF1",
          dataHoraUltimaAtualizacao: "2026-06-08T03:12:44.000Z",
          poloAtivo: [{ nome: "Maria da Silva", documento: "12345678900", tipoPessoa: "FISICA", papel: "Requerente" }],
          poloPassivo: [{ nome: "Instituto Nacional do Seguro Social", tipoPessoa: "JURIDICA", papel: "Requerido" }],
          partes: [{ nome: "Ministério Público Federal", papel: "Custos legis" }],
          movimentos: [{ codigo: 26, nome: "Distribuição", dataHora: "2018-10-29T10:05:00.000Z" }],
        },
      },
    ],
  },
}

const SAO_LUIS = { codigo: "16293", nome: "06ª - São Luís" }

/**
 * Movimentos no formato exato da API pública, copiados de respostas reais do
 * TRF1 (0001814-45.1997.4.01.3700): órgão com código em texto, complementos com
 * `descricao` técnica e `nome` legível, itens sem órgão e sem complemento.
 */
export const realMovementsResponse: DataJudSearchResponse = {
  hits: {
    total: { value: 1 },
    hits: [
      {
        _index: "api_publica_trf1",
        _id: "TRF1_G1_3700_00018144519974013700",
        _source: {
          numeroProcesso: "00018144519974013700",
          tribunal: "TRF1",
          grau: "G1",
          orgaoJulgador: { codigo: 16293, nome: "06ª - São Luís" },
          dataHoraUltimaAtualizacao: "2026-01-08T14:45:00.000Z",
          movimentos: [
            { codigo: 11383, nome: "Ato ordinatório", dataHora: "2026-01-08T14:45:00.000Z", orgaoJulgador: SAO_LUIS },
            {
              codigo: 581,
              nome: "Documento",
              dataHora: "2025-11-26T11:45:01.000Z",
              orgaoJulgador: SAO_LUIS,
              complementosTabelados: [{ codigo: 4, descricao: "tipo_de_documento", valor: 107, nome: "Certidão" }],
            },
            {
              codigo: 60,
              nome: "Expedição de documento",
              dataHora: "2025-12-04T22:16:00.000Z",
              orgaoJulgador: SAO_LUIS,
              complementosTabelados: [{ codigo: 4, descricao: "tipo_de_documento", valor: 107, nome: "Certidão" }],
            },
            {
              codigo: 123,
              nome: "Remessa",
              dataHora: "2025-12-04T18:46:00.000Z",
              complementosTabelados: [{ codigo: 18, descricao: "motivo_da_remessa", valor: 40, nome: "outros motivos" }],
            },
            { codigo: 1051, nome: "Decurso de Prazo", dataHora: "2025-10-02T00:00:00.000Z", orgaoJulgador: SAO_LUIS },
          ],
        },
      },
    ],
  },
}

/** Número não localizado no índice do tribunal. */
export const emptyResponse: DataJudSearchResponse = {
  took: 3,
  timed_out: false,
  hits: { total: { value: 0 }, hits: [] },
}
