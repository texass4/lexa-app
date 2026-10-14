/**
 * Conceitos jurídicos reconhecidos na pergunta da conversa — dicionário REVISÁVEL.
 *
 * Cada conceito junta formas que dizem a mesma coisa no vocabulário dos tribunais
 * (singular/plural, nome técnico e nome usual). Só entra aqui variante com
 * correspondência semântica direta: "danos extrapatrimoniais" é dano moral; "atraso"
 * sozinho NÃO é atraso contratual (pode ser atraso de benefício, de tributo, de voo).
 *
 * `branches`: ramos do Direito em que o conceito costuma aparecer — sinal de relevância,
 * nunca filtro: decisão de ramo fora da lista perde pontos, não some (pode tratar da
 * mesma questão processual). Sem ramo próprio (termo inicial, prescrição), fica vazio.
 *
 * `broader`: formas mais amplas que o conceito ("medicamento" para "fornecimento de
 * medicamento"; "hospital" para "responsabilidade do hospital"). Ajudam a achar
 * candidatas, mas valem metade — salvo quando a própria pergunta usou a forma ampla.
 *
 * `weak`: conceito genérico, que aparece em temas muito diferentes ("indenização");
 * conta metade e não decide sozinho se a decisão é pertinente.
 *
 * Para revisar: acrescente/retire variantes e rode `npm test` (os testes de
 * `jurisprudence-relevance.test.ts` mostram o efeito nos cenários de referência).
 */

export type LegalBranch = "privado" | "publico" | "penal"

export interface LegalConcept {
  key: string
  /** Como o conceito aparece nos logs e no contexto da IA. */
  label: string
  /** Formas que dizem exatamente o conceito (acentos e maiúsculas não importam). */
  variants: string[]
  /** Formas mais amplas: valem metade. */
  broader?: string[]
  branches?: LegalBranch[]
  weak?: boolean
}

const CIVIL_LIABILITY: LegalBranch[] = ["privado", "publico"]

export const LEGAL_CONCEPTS: LegalConcept[] = [
  {
    key: "negativacao_indevida",
    label: "negativação indevida",
    branches: ["privado"],
    variants: [
      "negativação indevida",
      "inscrição indevida",
      "inclusão indevida",
      "cadastro de inadimplentes",
      "cadastros de inadimplentes",
      "cadastro de proteção ao crédito",
      "cadastros de proteção ao crédito",
      "órgão de proteção ao crédito",
      "órgãos de proteção ao crédito",
    ],
    broader: ["negativação", "negativações"],
  },
  {
    key: "dano_moral",
    label: "dano moral",
    branches: CIVIL_LIABILITY,
    variants: ["dano moral", "danos morais", "dano extrapatrimonial", "danos extrapatrimoniais"],
  },
  {
    key: "dano_material",
    label: "dano material",
    branches: CIVIL_LIABILITY,
    variants: ["dano material", "danos materiais"],
  },
  {
    key: "atraso_contratual",
    label: "atraso/inadimplemento contratual",
    branches: ["privado"],
    variants: [
      "atraso contratual",
      "atraso na entrega",
      "atraso da entrega",
      "atraso na obra",
      "atraso da obra",
      "mora contratual",
      "inadimplemento contratual",
      "inadimplemento do contrato",
      "descumprimento contratual",
      "descumprimento do contrato",
    ],
  },
  {
    key: "indenizacao",
    label: "indenização",
    weak: true,
    variants: ["indenização", "indenizações", "reparação de danos", "reparação civil"],
  },
  {
    key: "responsabilidade_civil",
    label: "responsabilidade civil",
    branches: CIVIL_LIABILITY,
    weak: true,
    variants: ["responsabilidade civil"],
  },
  {
    key: "erro_medico",
    label: "erro médico",
    branches: CIVIL_LIABILITY,
    variants: ["erro médico", "erros médicos", "falha médica", "imperícia médica", "negligência médica", "responsabilidade médica", "responsabilidade civil do médico"],
  },
  {
    key: "responsabilidade_hospitalar",
    label: "responsabilidade do hospital",
    branches: CIVIL_LIABILITY,
    variants: ["responsabilidade hospitalar", "responsabilidade do hospital", "responsabilidade civil do hospital", "responsabilidade dos hospitais"],
    broader: ["hospital", "hospitais", "estabelecimento hospitalar"],
  },
  {
    key: "medicamento",
    label: "fornecimento de medicamento",
    branches: CIVIL_LIABILITY,
    variants: ["fornecimento de medicamento", "fornecimento de medicamentos", "fornecer medicamento", "fornecer medicamentos", "custeio de medicamento", "custeio de medicamentos"],
    broader: ["medicamento", "medicamentos", "fármaco", "fármacos"],
  },
  {
    key: "plano_de_saude",
    label: "plano de saúde",
    branches: ["privado"],
    variants: ["plano de saúde", "planos de saúde", "operadora de plano de saúde", "seguro saúde"],
  },
  {
    key: "sus",
    label: "Sistema Único de Saúde",
    branches: ["publico"],
    variants: ["sistema único de saúde", "sus"],
  },
  {
    key: "consumidor",
    label: "relação de consumo",
    branches: ["privado"],
    variants: ["relação de consumo", "código de defesa do consumidor", "cdc"],
    broader: ["consumidor", "consumidores"],
  },
  { key: "icms", label: "ICMS", branches: ["publico"], variants: ["icms"] },
  {
    key: "tusd_tust",
    label: "TUSD/TUST",
    branches: ["publico"],
    variants: ["tusd", "tust", "tarifa de uso do sistema de distribuição", "tarifa de uso do sistema de transmissão"],
  },
  {
    key: "tributo",
    label: "tributo",
    branches: ["publico"],
    weak: true,
    variants: ["tributo", "tributos", "tributário", "tributária", "imposto", "impostos", "crédito tributário"],
  },
  { key: "pis_cofins", label: "PIS/COFINS", branches: ["publico"], variants: ["pis", "cofins"] },
  { key: "iss", label: "ISS", branches: ["publico"], variants: ["iss", "issqn"] },
  {
    key: "beneficio_previdenciario",
    label: "benefício previdenciário",
    branches: ["publico"],
    variants: [
      "benefício previdenciário",
      "benefícios previdenciários",
      "aposentadoria",
      "aposentadorias",
      "auxílio-doença",
      "auxílio doença",
      "pensão por morte",
      "benefício por incapacidade",
      "regime geral de previdência social",
    ],
    broader: ["inss"],
  },
  {
    key: "termo_inicial",
    label: "termo inicial",
    variants: ["termo inicial", "data de início do benefício"],
  },
  { key: "prescricao", label: "prescrição", variants: ["prescrição", "prazo prescricional"] },
  {
    key: "penal",
    label: "matéria penal",
    branches: ["penal"],
    variants: ["crime", "crimes", "habeas corpus", "dosimetria", "tráfico de drogas", "pena privativa de liberdade"],
  },
]

/**
 * Cabeçalho do assunto da decisão (verbetação do STJ: "TRIBUTÁRIO. ICMS. …") → ramo.
 * Cabeçalhos processuais ("PROCESSUAL CIVIL", "AGRAVO INTERNO") não indicam ramo.
 */
export const SUBJECT_BRANCH: [RegExp, LegalBranch][] = [
  [/^(direito )?(processual penal|penal|execucao penal)\b/, "penal"],
  [/^(direito )?(tributario|previdenciario|administrativo|ambiental|financeiro|constitucional e tributario)\b/, "publico"],
  [/^(direito )?(civil|consumidor|do consumidor|empresarial|comercial|familia|de familia|locacao|bancario|securitario)\b/, "privado"],
]

/** Área da base do STJ (Regimento Interno, pelo órgão julgador) → ramo. */
export const AREA_BRANCH: Record<string, LegalBranch> = {
  "Direito Público": "publico",
  "Direito Privado": "privado",
  "Direito Penal": "penal",
}

/**
 * Palavras de pergunta que não são tema ("quais os critérios…", "cabe…"). Completa a
 * lista de `jurisprudence-intent.ts` só para a recuperação da IA — a pesquisa da tela
 * não muda.
 */
export const QUESTION_WORDS = new Set(
  (
    "quais qual quando como onde porque pois cabe cabem caber cabivel cabimento pode podem deve devem devido devida possivel possibilidade " +
    "hipotese hipoteses criterio criterios requisito requisitos argumento argumentos quero preciso gostaria saber sobre tese teses " +
    "situacao situacoes geral gerais cliente clientes meu minha nosso nossa ser sao foi estar esta existe ha tem algum alguma alguns " +
    "algumas outro outra outros outras mesmo mesma tambem ainda ja so apenas muito muita valor valores fixacao fixar caso casos " +
    "acao acoes processo processos recurso recursos pedido pedidos direito direitos justica pelo pela pelos pelas " +
    // Pedido de avaliação, não tema ("quais as chances deste caso?", "estratégias para este processo").
    "chance deste desta neste nesta disto disso nisso estrategia exito sucesso ganhar perder viabilidade analise analisar avaliar precedente"
  ).split(" "),
)

/** Palavras curtas que contam como palavra (siglas do Direito). */
export const SHORT_TERMS = new Set(["sus", "cdc", "pis", "iss", "inss", "icms", "tusd", "tust", "ir", "ipi", "itr"])
