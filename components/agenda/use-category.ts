"use client"

import * as React from "react"
import { categoryStyle } from "@/lib/config"
import { useDemoData } from "@/lib/store/demo-store"

/**
 * Resolve a categoria de um compromisso e os estilos da cor dela.
 * Compromisso sem categoria (ou com categoria excluída) usa a cor neutra.
 */
export function useCategoryLookup() {
  const { appointmentCategories } = useDemoData()
  return React.useMemo(() => {
    const byId = new Map(appointmentCategories.map((c) => [c.id, c]))
    return (categoryId?: string) => {
      const category = categoryId ? byId.get(categoryId) : undefined
      return { category, style: categoryStyle(category?.color) }
    }
  }, [appointmentCategories])
}
