/**
 * Limpeza final do que a IA escreve, antes de chegar à pessoa — o único lugar com estas
 * regras. Os dados enviados ao modelo continuam como estão (auditoria, cache, fontes).
 *
 * O modelo às vezes copia para a resposta nomes internos dos dados: chaves do JSON de
 * contexto ("[clientes_com_valores_em_atraso]"), nomes de seção ("pesquisa_de_jurisprudencia")
 * ou o nome antigo do produto (LEXA). As regras são ESPECÍFICAS — nada de apagar tudo que
 * está entre colchetes:
 *
 * 1. Entre colchetes, só some o que é identificador interno: palavras minúsculas ligadas
 *    por sublinhado ("[clientes_com_valores_em_atraso]", "[métricas_calculadas_pelo_lexa]")
 *    ou, com espaços, o nome de uma chave dos dados desta resposta ("[clientes com valores
 *    em atraso]"). "[J1]" (referência de fonte), "[sic]", "[…]", "[grifo nosso]",
 *    "[art. 5º, X]" e números CNJ ficam.
 * 2. Identificador interno solto no texto vira palavras comuns ("pesquisa de
 *    jurisprudência") — exceto dentro de link, e-mail ou nome de arquivo.
 * 3. "LEXA" (nome antigo) vira "Íntegra".
 * 4. Na conversa: referência solta ("a decisão J1", "(J1)") vira "[J1]", que a tela troca
 *    pelo link com a identificação real da fonte. Só para referências que existem.
 */

import type { AISources } from "./types"

export interface SanitizeOptions {
  /** Chaves dos dados enviados ao modelo (as de `contextKeys`). */
  contextKeys?: ReadonlySet<string>
  /** Fontes da resposta: com `linkBareRefs`, "J1" solto vira "[J1]". */
  sources?: AISources
  linkBareRefs?: boolean
}

/** Como dizer, em palavras comuns, os nomes internos que mais aparecem. */
const LABELS: Record<string, string> = {
  pesquisa_de_jurisprudencia: "pesquisa de jurisprudência",
  jurisprudencia_vinculada_ao_processo: "decisões vinculadas ao processo",
  jurisprudencia_salva_pelo_escritorio: "decisões salvas pelo escritório",
  termos_pesquisados: "termos pesquisados",
  conceitos_pesquisados: "conceitos pesquisados",
  conceitos_encontrados: "conceitos encontrados",
  candidatas_avaliadas: "decisões avaliadas",
  pontuacao_interna: "classificação interna",
  trecho_literal: "trecho",
  pertinencia: "pertinência",
  metricas_calculadas: "métricas do escritório",
  metricas_calculadas_pelo_lexa: "métricas do escritório",
  clientes_com_valores_em_atraso: "clientes com valores em atraso",
  modulos_sem_acesso: "módulos sem acesso",
}

/** Minúsculas, sem acento, espaços viram sublinhado: "Métricas calculadas" → "metricas_calculadas". */
const keyOf = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")

/** Identificador interno: palavras minúsculas (com ou sem acento) ligadas por sublinhado. */
const IDENTIFIER = String.raw`\p{Ll}[\p{Ll}\d]*(?:_[\p{Ll}\d]+)+`

/** "[clientes_com_valores_em_atraso]", "[`metricas`]", "[ pesquisa_de_jurisprudencia ]". */
const BRACKETED_IDENTIFIER = new RegExp(String.raw`\[\s*[\x60"']?(${IDENTIFIER})[\x60"']?\s*\]`, "gu")

/**
 * Palavra que só apontava para o marcador, quando ele fecha a oração: "ver
 * [clientes_com_valores_em_atraso]." perde o "ver" junto, para não sobrar "ver." solto.
 */
const ORPHAN_POINTER = new RegExp(
  String.raw`[ \t]+(?:ver|veja|vide|conforme|segundo|consulte|em|no|na|nos|nas|de|do|da|dos|das)[ \t]+(?=\[\s*[\x60"']?${IDENTIFIER}[\x60"']?\s*\][ \t]*(?:[.,;:!?)]|$))`,
  "gimu",
)

/**
 * Entre colchetes, duas ou mais palavras que podem ser o nome de uma chave escrito com
 * espaços ("[clientes com valores em atraso]"). Uma palavra só nunca: "[decisão]" numa
 * citação é inserção editorial legítima, mesmo que "decisao" seja chave dos dados.
 */
const BRACKETED_WORDS = /\[\s*(\p{L}+(?: \p{L}+){1,8})\s*\]/gu

/**
 * Identificador solto, com aspas ou crase opcionais. Não vale dentro de link, e-mail ou
 * nome de arquivo (vizinho de / . @ = ? & : ou de outra letra/sublinhado).
 */
const BARE_IDENTIFIER = new RegExp(String.raw`(?<![\p{L}\d_/.@=?&:\-])([\x60"“]?)(${IDENTIFIER})\1?(?![\p{L}\d_/@=?&\-]|\.[\p{L}\d])`, "gu")

/** Nome antigo do produto. "pelo/do/no LEXA" vira "pela/da/na Íntegra". */
const OLD_NAME_WITH_ARTICLE = /\b(pel|d|n)o\s+lexa\b/gi
const OLD_NAME = /\blexa\b/gi

/** "J1", "(J1)", "ref. J1" fora dos colchetes. */
const BARE_REF = /\(?\b(?:ref\.?\s*)?([A-Z]\d{1,3})\b\)?/g

const humanize = (identifier: string) => {
  const key = keyOf(identifier)
  if (LABELS[key]) return LABELS[key]
  return identifier.replace(/_/g, " ").replace(/\blexa\b/gi, "Íntegra")
}

/**
 * Arruma o que sobrou de uma remoção, para a frase continuar natural: espaço duplo,
 * espaço antes de pontuação, "()" vazio, vírgula dupla, pontuação órfã no começo da
 * linha, item de lista que ficou vazio e linhas vazias em excesso.
 */
function tidy(text: string) {
  return text
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?)])/g, "$1")
    .replace(/([,;])(?:\s*[,;])+/g, "$1")
    .replace(/[,;:](\s*[.!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/^([ \t]*(?:[-*•][ \t]+|\d+[.)][ \t]+)?)[.,;:](?![.])[ \t]*/gm, "$1")
    .replace(/^[ \t]*(?:[-*•]|\d+[.)])[ \t]*$/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
}

/** Texto livre da IA → texto para a pessoa. Não mexe em nada fora das regras acima. */
export function sanitizeAIText(text: string, options: SanitizeOptions = {}): string {
  if (!text) return text
  const { contextKeys, sources, linkBareRefs } = options
  let out = text.replace(ORPHAN_POINTER, " ").replace(BRACKETED_IDENTIFIER, "")
  if (contextKeys?.size) {
    out = out.replace(BRACKETED_WORDS, (match, words: string) => (contextKeys.has(keyOf(words)) ? "" : match))
  }
  out = out.replace(BARE_IDENTIFIER, (_match, _quote: string, identifier: string) => humanize(identifier))
  out = out.replace(OLD_NAME_WITH_ARTICLE, (_match, prefix: string) => `${prefix.toLowerCase() === "pel" ? "pela" : `${prefix}a`} Íntegra`)
  out = out.replace(OLD_NAME, "Íntegra")
  if (linkBareRefs && sources) {
    out = out.replace(BARE_REF, (match, ref: string, offset: number, whole: string) => {
      if (!(ref in sources) || whole[offset - 1] === "[" || whole[offset + match.length] === "]") return match
      return `[${ref}]`
    })
  }
  return tidy(out).replace(/^\n+/, "").replace(/\n+$/, text.endsWith("\n") ? "\n" : "")
}

/** Resposta estruturada (análises): limpa todos os textos, sem tocar nas chaves nem nos números. */
export function sanitizeAIOutput<T>(value: T, options: SanitizeOptions = {}): T {
  if (typeof value === "string") return sanitizeAIText(value, options) as T
  if (Array.isArray(value)) return value.map((item) => sanitizeAIOutput(item, options)) as T
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeAIOutput(item, options)])) as T
  }
  return value
}

/** Todas as chaves de um objeto (qualquer profundidade) — os nomes internos desta resposta. */
export function contextKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => contextKeys(item, out))
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.add(keyOf(key))
      contextKeys(item, out)
    }
  }
  return out
}

/**
 * Onde o texto ainda incompleto deixa de poder mudar de sentido: antes de um colchete ou
 * parêntese sem fechar, de uma palavra ainda sendo escrita e do espaço no fim.
 */
function settledEnd(raw: string) {
  let end = raw.length
  // Palavra (ou identificador) ainda sendo escrita: espera o próximo espaço.
  const trailing = /\S+$/.exec(raw)
  if (trailing) end = Math.min(end, trailing.index)
  for (const [open, close] of [
    ["[", "]"],
    ["(", ")"],
  ] as const) {
    const at = raw.lastIndexOf(open)
    if (at >= 0 && raw.indexOf(close, at) < 0 && raw.length - at <= 200) end = Math.min(end, at)
  }
  // Espaço no fim pode virar "espaço antes de pontuação" quando o resto chegar.
  while (end > 0 && /\s/.test(raw[end - 1])) end -= 1
  return end
}

/**
 * Texto ainda em geração (resposta transmitida em partes) → o que já pode aparecer:
 * limpo e sem nenhum pedaço que ainda pode virar marcador. Sem estado: pode ser chamada
 * a cada renderização com o texto acumulado.
 */
export function streamingView(raw: string, options: SanitizeOptions = {}): string {
  return sanitizeAIText(raw.slice(0, settledEnd(raw)), options)
}

/**
 * Para quem recebe a resposta em partes: devolve, a cada parte, o texto que já pode
 * aparecer; `finish()` devolve o texto final. Quem mostra troca o texto exibido pelo
 * devolvido (nunca concatena partes).
 */
export function createStreamSanitizer(options: SanitizeOptions = {}) {
  let raw = ""
  return {
    push(chunk: string) {
      raw += chunk
      return streamingView(raw, options)
    },
    finish() {
      return sanitizeAIText(raw, options)
    },
  }
}
