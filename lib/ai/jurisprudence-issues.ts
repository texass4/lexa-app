/**
 * Questões jurídicas, fatos determinantes e provas — dicionário REVISÁVEL da análise
 * comparativa de jurisprudência (`jurisprudence-case.ts`, `jurisprudence-pipeline.ts`).
 *
 * Nada aqui é FONTE: é o roteiro com que a Íntegra (1) reconhece a questão que o caso
 * levanta, (2) pesquisa a base com os conceitos centrais dela OBRIGATÓRIOS, (3) compara
 * os fatos do caso com os fatos que a ementa registra e (4) aponta, por padrões de
 * redação de ementa, se a decisão ACOLHE ou REJEITA a tese da questão — sempre com o
 * trecho literal que levou a essa leitura, para o advogado conferir.
 *
 * Os "requisitos" são um roteiro de VERIFICAÇÃO (o que costuma ser examinado nessas
 * ações), não conteúdo da base: a tela e a IA os apresentam assim, e só os ligam a uma
 * decisão quando a própria ementa os menciona.
 *
 * Para revisar: acrescente/retire questões, variantes ou padrões e rode `npm test` e
 * `npm run jurisprudence:benchmark` (casos de referência em scripts/jurisprudence-reference).
 * Pergunta fora deste catálogo continua funcionando: vira uma questão GENÉRICA a partir
 * dos conceitos da pergunta — sem tese nem posição automática.
 */

import { type LegalBranch, type LegalConcept, LEGAL_CONCEPTS } from "./jurisprudence-terms"

/* ------------------------------- conceitos extras ------------------------------- */

/** Conceitos usados só como núcleo de questões (a pesquisa da conversa não muda). */
export const ISSUE_CONCEPTS: LegalConcept[] = [
  {
    key: "poder_publico_saude",
    label: "poder público / SUS",
    branches: ["publico"],
    variants: [
      "sistema único de saúde",
      "sus",
      "ente público",
      "entes públicos",
      "ente federativo",
      "entes federativos",
      "poder público",
      "estado",
      "município",
      "municípios",
      "união",
      "fazenda pública",
    ],
  },
  {
    key: "hospital",
    label: "hospital",
    branches: ["privado", "publico"],
    variants: ["hospital", "hospitais", "estabelecimento hospitalar", "responsabilidade hospitalar", "clínica", "clínicas"],
  },
]

const ALL_CONCEPTS = new Map([...LEGAL_CONCEPTS, ...ISSUE_CONCEPTS].map((c) => [c.key, c]))
export const conceptByKey = (key: string) => ALL_CONCEPTS.get(key)

/* ------------------------------------ fatos ------------------------------------ */

export interface FactCue {
  key: string
  label: string
  /** Formas que indicam o fato (acentos e maiúsculas não importam; frase = palavras vizinhas). */
  variants: string[]
  /** Fato que NÃO pode coexistir com este (ex.: com × sem registro na Anvisa). */
  opposite?: string
}

/**
 * Fatos que costumam decidir essas questões. A mesma lista lê a pergunta/o processo e as
 * ementas — só o que está ESCRITO conta; nada é presumido.
 * Ordem importa: variante negativa ("sem registro na Anvisa") vem antes da positiva.
 */
export const FACTS: FactCue[] = [
  { key: "fraude_terceiro", label: "contratação fraudulenta/por terceiro", variants: ["fraude", "fraudes", "fraudulenta", "fraudulento", "fraudador", "terceiro fraudador", "nunca contratou", "não contratou", "golpe"], opposite: "divida_existente" },
  { key: "divida_quitada", label: "dívida já quitada", variants: ["dívida quitada", "débito quitado", "quitação", "pagamento integral", "após o pagamento", "já pagou", "já paga"], opposite: "divida_existente" },
  { key: "divida_inexistente", label: "dívida inexistente", variants: ["dívida inexistente", "inexistência de débito", "inexistência do débito", "débito inexistente", "sem débito", "sem dívida"], opposite: "divida_existente" },
  { key: "divida_existente", label: "dívida existente/inadimplência comprovada", variants: ["inadimplência comprovada", "existência da dívida", "devedor inadimplente", "dívida existente", "débito existente"] },
  { key: "inscricao_preexistente", label: "outras inscrições legítimas preexistentes", variants: ["anotações preexistentes", "anotação preexistente", "inscrição preexistente", "preexistente legítima inscrição", "outras anotações", "anotações anteriores", "outras negativações"] },
  { key: "protesto", label: "protesto de título (não inscrição em cadastro)", variants: ["protesto", "protestado", "protestada"] },
  { key: "pessoa_juridica", label: "vítima pessoa jurídica", variants: ["pessoa jurídica"] },
  {
    key: "imovel_construcao",
    label: "imóvel na planta/em construção",
    variants: ["imóvel na planta", "comprado na planta", "compra e venda de imóvel", "promessa de compra e venda", "compromisso de compra e venda", "unidade habitacional", "imóvel em construção", "incorporadora", "incorporação imobiliária", "construtora"],
  },
  {
    key: "circunstancia_excepcional",
    label: "circunstância que vai além do mero atraso (ex.: privação da moradia, atraso muito longo)",
    variants: ["circunstâncias excepcionais", "circunstância excepcional", "atraso excessivo", "mais de dois anos", "superior a dois anos", "sem moradia", "privando a família da moradia", "privação da moradia", "ficou sem moradia"],
  },
  { key: "prazo_tolerancia", label: "prazo/cláusula de tolerância", variants: ["prazo de tolerância", "cláusula de tolerância"] },
  { key: "sem_registro_anvisa", label: "medicamento SEM registro na Anvisa", variants: ["sem registro na anvisa", "não registrado na anvisa", "ausência de registro na anvisa", "importado sem registro"], opposite: "registro_anvisa" },
  { key: "registro_anvisa", label: "medicamento com registro na Anvisa", variants: ["registro na anvisa", "registrado na anvisa"] },
  { key: "nao_incorporado_sus", label: "medicamento não incorporado ao SUS", variants: ["não incorporado", "não incorporados", "fora da lista", "não padronizado"] },
  { key: "laudo_medico", label: "laudo médico", variants: ["laudo médico", "laudo"] },
  { key: "incapacidade_financeira", label: "incapacidade financeira do paciente", variants: ["incapacidade financeira", "sem condições financeiras", "não tem condições financeiras", "hipossuficiência", "hipossuficiente", "não pode arcar"] },
  { key: "plano_saude", label: "réu é operadora de plano de saúde (não o poder público)", variants: ["plano de saúde", "operadora", "saúde suplementar"] },
  { key: "medico_sem_vinculo", label: "médico sem vínculo com o hospital", variants: ["sem vínculo", "apenas utiliza suas instalações", "não integra o corpo clínico"], opposite: "medico_corpo_clinico" },
  { key: "medico_corpo_clinico", label: "médico do corpo clínico/empregado/preposto", variants: ["corpo clínico", "médico empregado", "preposto", "preposição", "plantonista do hospital"] },
  { key: "atendimento_instalacoes", label: "atendimento nas instalações do hospital", variants: ["nas suas instalações", "nas instalações", "suas instalações", "utiliza suas instalações"] },
  { key: "servico_hospitalar", label: "falha de serviço hospitalar (internação, enfermagem, infecção)", variants: ["infecção hospitalar", "enfermagem", "internação", "serviços hospitalares", "estadia do paciente"] },
  { key: "culpa_medico", label: "culpa do médico comprovada", variants: ["culpa do médico", "culpa do profissional", "negligência", "imperícia", "imprudência"] },
  { key: "sem_requerimento", label: "SEM requerimento administrativo prévio", variants: ["ausência de prévio requerimento", "ausência de requerimento", "sem requerimento", "não houve requerimento", "sem prévio requerimento"], opposite: "requerimento_administrativo" },
  { key: "requerimento_administrativo", label: "houve requerimento administrativo", variants: ["requerimento administrativo", "pedido administrativo", "houve requerimento"] },
  { key: "fatura_energia", label: "tarifas lançadas na fatura de energia", variants: ["fatura de energia", "conta de energia", "fatura"] },
]

const FACT_BY_KEY = new Map(FACTS.map((f) => [f.key, f]))
export const factByKey = (key: string) => FACT_BY_KEY.get(key)

/* ------------------------------------ provas ------------------------------------ */

export interface EvidenceCue {
  key: string
  label: string
  variants: string[]
}

/** Provas que a pessoa pode mencionar. Mencionar não é provar: só se registra que existe ou falta. */
export const EVIDENCE: EvidenceCue[] = [
  { key: "contrato", label: "contrato", variants: ["contrato", "contratos", "promessa de compra e venda"] },
  { key: "comprovante_inscricao", label: "comprovante da inscrição no cadastro", variants: ["comprovante da inscrição", "extrato do serasa", "extrato do spc", "consulta ao serasa", "consulta ao spc", "print do serasa", "certidão do cadastro"] },
  { key: "comprovante_pagamento", label: "comprovante de pagamento/quitação", variants: ["comprovante de pagamento", "recibo", "recibos", "boleto pago", "quitação"] },
  { key: "boletim_ocorrencia", label: "boletim de ocorrência", variants: ["boletim de ocorrência", "registro policial"] },
  { key: "laudo_medico", label: "laudo médico", variants: ["laudo médico", "laudo", "relatório médico", "receita médica", "prescrição médica"] },
  { key: "prontuario", label: "prontuário", variants: ["prontuário", "prontuários"] },
  { key: "pericia", label: "perícia", variants: ["perícia", "laudo pericial"] },
  { key: "notificacao", label: "notificação/comunicação", variants: ["notificação", "notificações", "e-mail", "emails", "mensagens", "protocolo de atendimento", "protocolos"] },
  { key: "comprovante_renda", label: "comprovante de renda", variants: ["comprovante de renda", "declaração de hipossuficiência", "imposto de renda"] },
  { key: "requerimento", label: "comprovante do requerimento administrativo", variants: ["comprovante do requerimento", "protocolo do requerimento", "carta de indeferimento", "indeferimento administrativo"] },
  { key: "fatura", label: "faturas de energia", variants: ["fatura", "faturas", "conta de energia", "contas de energia"] },
  { key: "fotos", label: "fotos/vistoria", variants: ["fotos", "fotografias", "vistoria"] },
]

/* ----------------------------------- questões ----------------------------------- */

export interface IssueRequirement {
  /** O que costuma ser examinado (roteiro de verificação, não fonte). */
  text: string
  /** Provas que costumam demonstrar o requisito. */
  evidence?: string[]
  /** Fato do caso que, se presente, indica o requisito. */
  fact?: string
}

export interface LegalIssue {
  key: string
  /** A questão a decidir, como pergunta. */
  question: string
  /** A tese AFIRMATIVA da questão (o que "acolher" significa). */
  thesis: string
  /** Ramos em que a questão é decidida: decisão de outro ramo (ex.: penal) não sustenta a tese. */
  branches: LegalBranch[]
  /** Conceitos centrais: TODOS obrigatórios na pesquisa (E). */
  core: string[]
  /** Quando o caso levanta a questão: todos estes conceitos e ao menos um de `triggerAny`. */
  trigger: string[]
  triggerAny?: string[]
  /** Expressões típicas de ementa sobre a questão (consulta alternativa). */
  expressions: string[]
  /** Fatos determinantes para esta questão. */
  facts: string[]
  requirements: IssueRequirement[]
  /** Padrões (texto sem acento, minúsculo) de que a decisão ACOLHE a tese. */
  supports: RegExp[]
  /** Padrões de que a decisão REJEITA a tese (prevalecem sobre `supports` na mesma oração). */
  rejects: RegExp[]
  /** Expressões que, na base, costumam vir nas decisões que rejeitam a tese (consulta de contrários). */
  rejectExpressions?: string[]
}

const DANO = "dano(s)? mora(l|is)"

export const LEGAL_ISSUES: LegalIssue[] = [
  {
    key: "negativacao_dano_moral",
    question: "A inscrição indevida em cadastro de inadimplentes gera dano moral indenizável?",
    thesis: "A inscrição indevida gera dano moral indenizável.",
    branches: ["privado"],
    core: ["negativacao_indevida", "dano_moral"],
    trigger: ["negativacao_indevida"],
    triggerAny: ["dano_moral", "indenizacao", "responsabilidade_civil"],
    expressions: ["dano moral in re ipsa", "inscrição indevida em cadastro de inadimplentes", "manutenção indevida"],
    facts: ["fraude_terceiro", "divida_quitada", "divida_inexistente", "divida_existente", "inscricao_preexistente", "protesto", "pessoa_juridica"],
    requirements: [
      { text: "A inscrição (ou a manutenção) foi efetivada no cadastro", evidence: ["comprovante_inscricao"] },
      { text: "A dívida é inexistente, já paga ou decorre de fraude", evidence: ["comprovante_pagamento", "boletim_ocorrencia", "contrato"], fact: "divida_inexistente" },
      { text: "Se havia outras inscrições legítimas anteriores (podem afastar o dano moral)", evidence: ["comprovante_inscricao"] },
      { text: "Quem fez ou manteve a inscrição (credor, órgão do cadastro)", evidence: ["notificacao", "comprovante_inscricao"] },
    ],
    supports: [new RegExp(`(configura|caracteriza|gera|enseja|reconheceu configurado o)[^.;]{0,60}${DANO}`), new RegExp(`${DANO}[^.;]{0,20}in re ipsa`), /independentemente de prova do (abalo|prejuizo)/, /dispensando a prova do prejuizo/],
    rejects: [
      new RegExp(`nao cabe indenizacao por ${DANO}`),
      new RegExp(`${DANO} nao configurado`),
      /nao gerando dever de indenizar/,
      new RegExp(`(nao|nunca) (gera|enseja|configura|caracteriza)[^.;]{0,40}${DANO}`),
      /preexistente legitima inscricao/,
      /exercicio regular de direito/,
    ],
    rejectExpressions: ["preexistente legítima inscrição", "exercício regular de direito", "anotações preexistentes"],
  },
  {
    key: "inadimplemento_dano_moral",
    question: "O atraso ou inadimplemento contratual gera dano moral?",
    thesis: "O atraso/inadimplemento contratual gera dano moral indenizável no caso.",
    branches: ["privado"],
    core: ["atraso_contratual", "dano_moral"],
    trigger: ["atraso_contratual"],
    triggerAny: ["dano_moral", "indenizacao"],
    expressions: ["mero inadimplemento contratual", "mero dissabor", "circunstâncias excepcionais"],
    facts: ["imovel_construcao", "circunstancia_excepcional", "prazo_tolerancia"],
    requirements: [
      { text: "Prazo contratual de entrega e cláusula de tolerância", evidence: ["contrato"], fact: "prazo_tolerancia" },
      { text: "Duração do atraso além do prazo de tolerância", evidence: ["contrato", "notificacao"] },
      { text: "Circunstâncias que vão além do mero inadimplemento (ex.: privação da moradia)", evidence: ["notificacao", "fotos"], fact: "circunstancia_excepcional" },
      { text: "Prejuízos materiais (aluguel pago, lucros cessantes) — pedido distinto do dano moral", evidence: ["comprovante_pagamento"] },
    ],
    supports: [new RegExp(`(configura|caracteriza|gera|enseja)[^.;]{0,40}${DANO}`), /extrapola o mero dissabor/],
    rejects: [/configura mero inadimplemento/, new RegExp(`(nao|nunca) (gera|enseja|configura|caracteriza)[^.;]{0,40}${DANO}`), /mero inadimplemento contratual nao/],
    rejectExpressions: ["mero inadimplemento contratual", "por si só"],
  },
  {
    key: "medicamento_poder_publico",
    question: "O poder público é obrigado a fornecer o medicamento pedido?",
    thesis: "O ente público deve fornecer o medicamento.",
    branches: ["publico"],
    core: ["medicamento", "poder_publico_saude"],
    trigger: ["medicamento", "poder_publico_saude"],
    expressions: ["requisitos cumulativos", "imprescindibilidade do medicamento", "responsabilidade solidária dos entes federativos"],
    facts: ["sem_registro_anvisa", "registro_anvisa", "nao_incorporado_sus", "laudo_medico", "incapacidade_financeira", "plano_saude"],
    requirements: [
      { text: "Laudo médico fundamentado sobre a necessidade do medicamento e a ineficácia das alternativas", evidence: ["laudo_medico"], fact: "laudo_medico" },
      { text: "Incapacidade financeira de custear o tratamento", evidence: ["comprovante_renda"], fact: "incapacidade_financeira" },
      { text: "Registro do medicamento na Anvisa", fact: "registro_anvisa" },
      { text: "Situação do medicamento nas listas do SUS", fact: "nao_incorporado_sus" },
    ],
    supports: [/obrigacao do ente publico de fornecer/, /(dever|obrigacao)[^.;]{0,30}(de )?fornecer/, /responsabilidade solidaria/],
    rejects: [/nao (esta|estao|e) obrigad[oa]s? a fornecer/, /improcedente o pedido/, /\bimpossibilidade\b/],
    rejectExpressions: ["sem registro na Anvisa", "não está obrigado a fornecer"],
  },
  {
    key: "hospital_erro_medico",
    question: "O hospital responde pelo erro do médico?",
    thesis: "O hospital responde pelos danos do erro médico.",
    branches: ["privado", "publico"],
    core: ["hospital", "erro_medico"],
    trigger: ["hospital"],
    triggerAny: ["erro_medico", "responsabilidade_civil", "indenizacao", "dano_moral"],
    expressions: ["responsabilidade objetiva do hospital", "corpo clínico", "sem vínculo"],
    facts: ["medico_sem_vinculo", "medico_corpo_clinico", "atendimento_instalacoes", "servico_hospitalar", "culpa_medico"],
    requirements: [
      { text: "Vínculo do médico com o hospital (corpo clínico, empregado, preposto)", evidence: ["contrato", "prontuario"], fact: "medico_corpo_clinico" },
      { text: "Se o dano decorre de serviço do hospital (internação, enfermagem, infecção) ou de ato técnico do médico", evidence: ["prontuario", "pericia"], fact: "servico_hospitalar" },
      { text: "Culpa do médico, quando o dano decorre de ato técnico", evidence: ["pericia", "prontuario"], fact: "culpa_medico" },
      { text: "Nexo causal e extensão do dano", evidence: ["pericia", "laudo_medico"] },
    ],
    supports: [/hospital responde/, /responsabilidade do hospital e objetiva/, /responde solidariamente/],
    rejects: [/hospital nao responde/, /responsabilidade do hospital afastada/, /afastar a responsabilidade do hospital/],
    rejectExpressions: ["sem vínculo", "não responde objetivamente"],
  },
  {
    key: "icms_tusd_tust",
    question: "A TUSD e a TUST integram a base de cálculo do ICMS sobre energia elétrica?",
    thesis: "A TUSD/TUST integram a base de cálculo do ICMS.",
    branches: ["publico"],
    core: ["icms", "tusd_tust"],
    trigger: ["icms", "tusd_tust"],
    expressions: ["base de cálculo do ICMS", "energia elétrica"],
    facts: ["fatura_energia"],
    requirements: [
      { text: "Como as tarifas aparecem na fatura de energia", evidence: ["fatura"], fact: "fatura_energia" },
      { text: "Período e regime de recolhimento discutidos", evidence: ["fatura"] },
    ],
    supports: [/integram a base de calculo/, /inclusao na base de calculo/],
    rejects: [/nao integram a base de calculo/, /exclusao (da tusd|da tust|das tarifas)/],
  },
  {
    key: "termo_inicial_beneficio",
    question: "Qual o termo inicial do benefício previdenciário?",
    thesis: "O termo inicial é a data do requerimento administrativo.",
    branches: ["publico"],
    core: ["beneficio_previdenciario", "termo_inicial"],
    trigger: ["beneficio_previdenciario", "termo_inicial"],
    expressions: ["data do requerimento administrativo", "citação válida", "data de início do benefício"],
    facts: ["requerimento_administrativo", "sem_requerimento"],
    requirements: [
      { text: "Se houve requerimento administrativo e em que data", evidence: ["requerimento"], fact: "requerimento_administrativo" },
      { text: "Quando os requisitos do benefício foram preenchidos (ex.: data da incapacidade no laudo)", evidence: ["laudo_medico", "pericia"] },
    ],
    supports: [/termo inicial[^.;]{0,80}(data do )?requerimento administrativo/],
    rejects: [/termo inicial[^.;]{0,80}citacao/, /termo inicial[^.;]{0,80}juntada do laudo/],
  },
]

/* ----------------------------------- leitura ----------------------------------- */

/** Ressalva/exceção dentro da oração ("salvo…", "ressalvado…"): não inverte a posição. */
const EXCEPTION = /,?\s*(salvo|ressalvad[oa]s?|exceto|excetuad[oa]s?)\b/
/** "contudo/todavia/entretanto/porém": o que vem depois prevalece. */
const TURN = /[;,]?\s*\b(contudo|todavia|entretanto|porem|no entanto)\b,?/

export type Stance = "acolhe" | "rejeita" | "indeterminada"

export interface StanceReading {
  stance: Stance
  /** A oração da ementa que levou à leitura — cópia literal (com acentos). */
  sentence?: string
  /** Ressalva literal na mesma oração ("salvo …"). */
  exception?: string
  /** Condição literal ("Na ausência de…", "quando…") que limita a aplicação. */
  condition?: string
}

const foldText = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * Posição da decisão quanto à tese da questão, lida na ementa (e, sem ela, na tese).
 * Considera só os itens numerados e o cabeçalho; nunca o dispositivo processual
 * ("recurso provido" diz quem ganhou o recurso, não qual tese foi acolhida).
 */
export function readStance(issue: Pick<LegalIssue, "supports" | "rejects">, text: string | undefined): StanceReading {
  if (!text) return { stance: "indeterminada" }
  const sentences = text.split(/(?<=[.;])\s+(?=\d+\.\s|[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/u).map((s) => s.trim()).filter(Boolean)
  let found: StanceReading | undefined
  let conflicting = false
  for (const sentence of sentences) {
    const folded = foldText(sentence)
    // O que vem depois de "contudo" prevalece; a ressalva ("salvo…") não conta para a posição.
    const turn = TURN.exec(folded)
    const main = turn ? folded.slice(turn.index + turn[0].length) : folded
    const exceptionAt = EXCEPTION.exec(main)
    const core = exceptionAt ? main.slice(0, exceptionAt.index) : main
    let stance: Stance | undefined
    if (issue.rejects.some((r) => r.test(core))) stance = "rejeita"
    else if (issue.supports.some((r) => r.test(core))) stance = "acolhe"
    if (!stance) continue
    const reading: StanceReading = { stance, sentence }
    if (exceptionAt) {
      // Mesma posição no texto original (dobrar acentos não muda o comprimento).
      const start = (turn ? turn.index + turn[0].length : 0) + exceptionAt.index
      reading.exception = sentence.slice(start).replace(/^[,\s]+/, "").trim()
    }
    const condition = /^(\d+\.\s*)?((na|em) (ausencia|falta) de|quando|se|caso)\b[^,]*,/.exec(folded)
    if (condition) reading.condition = sentence.slice(condition[0].indexOf(condition[2]), condition[0].length - 1).trim()
    if (!found) found = reading
    else if (found.stance !== reading.stance) conflicting = true
  }
  if (!found) return { stance: "indeterminada" }
  return conflicting ? { stance: "indeterminada", sentence: found.sentence } : found
}

/** Resultado do julgamento como escrito (dispositivo): "negar provimento ao agravo interno"… */
export function readOutcome(decision: { ementa: string; decisionText?: string }): string | undefined {
  const sources = [decision.decisionText, decision.ementa.split(/\s(?=\d+\.\s)/).pop()]
  for (const text of sources) {
    if (!text) continue
    const match =
      /\b((?:por (?:unanimidade|maioria),\s*)?(?:negar|dar|dar parcial) provimento a[o]? [^,.;]+|(?:recurso especial|agravo interno|agravo|recurso|embargos de declaração|ordem|recurso em habeas corpus)[^.;]{0,40}?\b(?:não provido|provido|parcialmente provido|rejeitados|acolhidos|denegada|concedida|não conhecido)[^.;]*|denegar a ordem|conceder a ordem|rejeitar os embargos de declaração|agravo conhecido para não conhecer do recurso especial)/i.exec(
        text,
      )
    if (match) return match[1].replace(/\s+/g, " ").trim()
  }
  return undefined
}
