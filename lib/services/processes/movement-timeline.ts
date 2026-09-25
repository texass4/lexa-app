/**
 * Estrutura da timeline de movimentações: dias e agrupamentos visuais.
 *
 * O agrupamento é só de apresentação — cada `TimelineCluster` carrega todas as
 * movimentações originais, que continuam individuais no store. Nenhum registro
 * é fundido, alterado ou descartado.
 */

import { fold } from "@/lib/format"
import type { LexaMovement, MovementCategory } from "./movement-interpreter"

export interface TimelineSingle {
  type: "single"
  key: string
  movement: LexaMovement
}

/** Sequência de movimentações iguais no mesmo dia, exibida como uma linha. */
export interface TimelineCluster {
  type: "cluster"
  key: string
  /** Da mais recente para a mais antiga, como na timeline. */
  movements: LexaMovement[]
  category: MovementCategory
  /** Ex.: "8 atos ordinatórios". */
  label: string
  description?: string
  judicialUnit?: LexaMovement["judicialUnit"]
  /** Horário da mais antiga e da mais recente. */
  from: string
  to: string
}

export type TimelineItem = TimelineSingle | TimelineCluster

export interface TimelineDay {
  /** `YYYY-MM-DD` do horário original. */
  date: string
  items: TimelineItem[]
  /** Movimentações reais no dia (clusters contam cada item). */
  count: number
}

/** Abaixo disso, repetições aparecem uma a uma. */
export const MIN_CLUSTER_SIZE = 3

/* --------------------------------- plural --------------------------------- */

/** Palavras que encerram o núcleo do nome: "Expedição de documento" → "Expedições de documento". */
const CONNECTORS = new Set(["de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "a", "à", "ao", "aos", "para", "por", "com", "e", "ou", "sobre"])

function pluralWord(word: string): string | null {
  if (/[\d/()]/.test(word) || word.length < 2) return null
  const lower = word.toLowerCase()
  if (lower.endsWith("ão")) return `${word.slice(0, -2)}ões`
  if (/[sx]$/.test(lower)) return word
  if (lower.endsWith("al")) return `${word.slice(0, -1)}is`
  if (/[rz]$/.test(lower)) return `${word}es`
  if (/[aeiouáéíóúâêô]$/.test(lower)) return `${word}s`
  return null
}

/**
 * Plural do nome do movimento, pluralizando só o núcleo (antes do primeiro
 * conector). Devolve `null` quando a regra simples não é confiável.
 */
export function pluralizeMovementTitle(title: string): string | null {
  const words = title.trim().split(/\s+/)
  const out: string[] = []
  let inNucleus = true
  for (const word of words) {
    if (inNucleus && CONNECTORS.has(word.toLowerCase())) inNucleus = false
    if (!inNucleus) {
      out.push(word)
      continue
    }
    const plural = pluralWord(word)
    if (plural === null) return null
    out.push(plural)
  }
  return out.join(" ")
}

/** "8 atos ordinatórios"; sem plural confiável, "8× Expedida/Certificada". */
export function clusterLabel(title: string, count: number): string {
  const plural = pluralizeMovementTitle(title)
  if (!plural) return `${count}× ${title}`
  // Só baixa a inicial quando a palavra não é sigla ("PJe", "INSS").
  const lowered = /^[A-ZÀ-Ý][a-zà-ÿ]/.test(plural) ? plural.charAt(0).toLowerCase() + plural.slice(1) : plural
  return `${count} ${lowered}`
}

/* -------------------------------- montagem -------------------------------- */

const sameKind = (movement: LexaMovement) =>
  [movement.category, fold(movement.title), fold(movement.description ?? ""), movement.judicialUnit?.name ?? ""].join("|")

function pushRun(items: TimelineItem[], run: LexaMovement[], minClusterSize: number) {
  if (run.length >= minClusterSize) {
    const [newest] = run
    items.push({
      type: "cluster",
      key: `cluster:${newest.id}`,
      movements: run,
      category: newest.category,
      label: clusterLabel(newest.title, run.length),
      description: newest.description,
      judicialUnit: newest.judicialUnit,
      from: run[run.length - 1].at,
      to: newest.at,
    })
    return
  }
  for (const movement of run) items.push({ type: "single", key: movement.id, movement })
}

/**
 * Agrupa por dia e junta, visualmente, sequências de movimentações iguais.
 *
 * Espera a lista já ordenada da mais recente para a mais antiga (como
 * `interpretMovements` devolve). Uma passada só, sem reordenar.
 */
export function buildTimeline(movements: readonly LexaMovement[], minClusterSize = MIN_CLUSTER_SIZE): TimelineDay[] {
  const days: TimelineDay[] = []
  let day: TimelineDay | null = null
  let run: LexaMovement[] = []
  let runKey = ""

  const flush = () => {
    if (day && run.length) pushRun(day.items, run, minClusterSize)
    run = []
    runKey = ""
  }

  for (const movement of movements) {
    const date = movement.at.slice(0, 10)
    if (!day || day.date !== date) {
      flush()
      day = { date, items: [], count: 0 }
      days.push(day)
    }
    day.count += 1

    const key = sameKind(movement)
    if (run.length && key !== runKey) flush()
    runKey = key
    run.push(movement)
  }
  flush()

  return days
}
