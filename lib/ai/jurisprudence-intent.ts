/**
 * Quando uma pergunta da conversa é sobre jurisprudência — e com que termos pesquisar
 * na base. Regras simples e previsíveis (sem IA): a pesquisa é sempre na base oficial
 * indexada, e o modelo só vê o que ela devolveu.
 */

const INTENT =
  /jurisprud|precedente|ac[oó]rd[aã]o|julgad|s[uú]mula|\bstj\b|\bstf\b|entendimento (d[oa]s?|predominante)|o que (o|os) tribuna|decis(ão|ao|ões|oes) (semelhante|parecid|sobre|d[oa]s? (stj|tribunal|tribunais))|decis(ões|oes) (salvas|vinculadas)/i

/** Palavras do pedido em si ("há jurisprudência sobre…") que não são o tema pesquisado. */
const FILLER = new Set(
  (
    "ha há existe existem tem têm tem quais qual sobre respeito acerca jurisprudencia jurisprudência jurisprudencias jurisprudências precedente precedentes " +
    "decisao decisão decisoes decisões acordao acórdão acordaos acórdãos julgado julgados sumula súmula sumulas súmulas stj stf tribunal tribunais superior superiores " +
    "entendimento entendimentos predominante que o a os as um uma uns umas de do da dos das no na nos nas em para por com sem e ou me mostre mostrar encontre encontrar " +
    "busque buscar procure procurar pesquise pesquisar liste listar traga trazer base relacionada relacionadas relacionado relacionados semelhante semelhantes " +
    "parecida parecidas parecido parecidos este esta esse essa isso isto processo caso cliente aplicavel aplicável aplicaveis aplicáveis recentes recente mais " +
    "salvas salvou salvamos vinculadas vinculada escritorio escritório nosso nossa nossos nossas aqui dizem diz decidiu decidem decidido sentido favor favoravel favorável"
  ).split(" "),
)

export function asksForJurisprudence(question: string) {
  return INTENT.test(question)
}

/** Só as palavras do tema: "Há jurisprudência sobre negativação indevida?" → "negativação indevida". */
export function searchTermsFrom(question: string) {
  return question
    .replace(/[?!.,;:()"“”'’]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !FILLER.has(word.toLowerCase()))
    .join(" ")
    .slice(0, 300)
    .trim()
}

/** Pede decisões que o escritório já guardou (salvas), em vez de pesquisar a base. */
export const asksForSaved = (question: string) => /(salv(as|ou|amos|ei)|guardad)/i.test(question)
