"use client"

import * as React from "react"
import { personColor } from "@/lib/agenda/agenda"
import { useCategoryLookup } from "./use-category"
import type { Appointment } from "@/types"

/** Como colorir a agenda: pela categoria do compromisso ou pela pessoa responsável. */
export type ColorBy = "categoria" | "advogado"

/** Cor do compromisso conforme o modo; `undefined` = neutra (sem categoria). */
export function useEventColor(colorBy: ColorBy) {
  const lookup = useCategoryLookup()
  return React.useCallback(
    (a: Pick<Appointment, "categoryId" | "ownerId">) => (colorBy === "advogado" ? personColor(a.ownerId) : lookup(a.categoryId).category?.color),
    [colorBy, lookup],
  )
}
