"use client"

import * as React from "react"
import { createLocalStore } from "@/lib/core/hooks"
import type { ColorBy } from "./use-event-color"

/** Preferências da Agenda guardadas no navegador de quem usa (não mudam a agenda de ninguém). */
export type AgendaView = "dia" | "semana" | "mes" | "lista"

const viewStore = createLocalStore("lexa:agenda:visao", "semana")
const colorStore = createLocalStore("lexa:agenda:cor", "categoria")
const layersStore = createLocalStore("lexa:agenda:camadas", "prazos,tarefas")

const VIEWS: AgendaView[] = ["dia", "semana", "mes", "lista"]

function useStore(store: ReturnType<typeof createLocalStore>) {
  return React.useSyncExternalStore(store.subscribe, store.get, store.getServer)
}

export function useAgendaView(): [AgendaView, (v: AgendaView) => void] {
  const raw = useStore(viewStore)
  return [VIEWS.includes(raw as AgendaView) ? (raw as AgendaView) : "semana", (v) => viewStore.set(v)]
}

export function useColorBy(): [ColorBy, (v: ColorBy) => void] {
  const raw = useStore(colorStore)
  return [raw === "advogado" ? "advogado" : "categoria", (v) => colorStore.set(v)]
}

/** Prazos e tarefas na grade: ligados por padrão. */
export function useLayers(): { prazos: boolean; tarefas: boolean; toggle: (layer: "prazos" | "tarefas") => void } {
  const raw = useStore(layersStore)
  const on = new Set(raw.split(",").filter(Boolean))
  return {
    prazos: on.has("prazos"),
    tarefas: on.has("tarefas"),
    toggle: (layer) => {
      const next = new Set(on)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      layersStore.set([...next].join(","))
    },
  }
}

/** Painel da direita: "" = automático (aparece só em telas bem largas), ou aberto/fechado de propósito. */
const asideStore = createLocalStore("lexa:agenda:painel", "")
export type AsidePref = "" | "aberto" | "fechado"
export function useAsidePref(): [AsidePref, (v: AsidePref) => void] {
  const raw = useStore(asideStore)
  return [raw === "aberto" || raw === "fechado" ? raw : "", (v) => asideStore.set(v)]
}
