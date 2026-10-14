/**
 * Índices em memória das coleções do store: busca por id e agrupamentos (prazos de um
 * processo, tarefas de um registro…) sem percorrer a lista inteira a cada consulta.
 *
 * O store é imutável — cada coleção alterada vira uma lista nova —, então o índice é
 * guardado por lista (`WeakMap`): calculado uma vez por versão da coleção e descartado
 * com ela. Telas, sinais e seletores chamam à vontade, sem `useMemo`.
 */

type Keyed = { id: string }

const byIdCache = new WeakMap<readonly object[], Map<string, unknown>>()
const groupCache = new WeakMap<readonly object[], Map<string, Map<string, unknown[]>>>()

/** Registro por id. */
export function indexById<T extends Keyed>(list: readonly T[]): Map<string, T> {
  let index = byIdCache.get(list) as Map<string, T> | undefined
  if (!index) {
    index = new Map(list.map((item) => [item.id, item]))
    byIdCache.set(list, index)
  }
  return index
}

/** Busca por id (atalho de `indexById`). */
export const byId = <T extends Keyed>(list: readonly T[], id: string | undefined): T | undefined => (id ? indexById(list).get(id) : undefined)

/**
 * Registros agrupados por uma chave, na ordem da lista. `name` identifica o
 * agrupamento — a mesma `name` deve sempre usar a mesma função `key`.
 */
export function groupBy<T extends object>(list: readonly T[], name: string, key: (item: T) => string | undefined): Map<string, T[]> {
  let groups = groupCache.get(list)
  if (!groups) {
    groups = new Map()
    groupCache.set(list, groups)
  }
  let index = groups.get(name) as Map<string, T[]> | undefined
  if (!index) {
    index = new Map()
    for (const item of list) {
      const k = key(item)
      if (k === undefined) continue
      const bucket = index.get(k)
      if (bucket) bucket.push(item)
      else index.set(k, [item])
    }
    groups.set(name, index)
  }
  return index
}

const NONE: never[] = []

/** Itens de um grupo (lista vazia quando não há). */
export const groupOf = <T extends object>(
  list: readonly T[],
  name: string,
  key: (item: T) => string | undefined,
  value: string | undefined,
): readonly T[] => (value === undefined ? NONE : (groupBy(list, name, key).get(value) ?? NONE))

// Agrupamentos usados em mais de um lugar (mesmo nome = mesma chave).

/** Prazos de cada processo. */
export const prazosByProcess = <T extends { processId: string }>(prazos: readonly T[], processId: string) =>
  groupOf(prazos, "processId", (p) => p.processId, processId)

/** Tarefas vinculadas a um registro (cliente ou processo), pelo id do registro. */
export const tasksByRelated = <T extends { related?: { id: string } }>(tasks: readonly T[], id: string) =>
  groupOf(tasks, "related", (t) => t.related?.id, id)

/** Processos de cada cliente. */
export const processesByClient = <T extends { clientId: string }>(processes: readonly T[], clientId: string) =>
  groupOf(processes, "clientId", (p) => p.clientId, clientId)
