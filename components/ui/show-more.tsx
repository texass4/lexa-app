"use client"

import * as React from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

/** Itens desenhados por vez nas listagens longas (a busca e os filtros valem para todos). */
export const LIST_PAGE = 50

/**
 * Quantos itens da lista desenhar. Volta ao início quando `key` muda (outro filtro,
 * outra busca); `more` desenha mais uma página.
 */
export function useRenderLimit(key: string, page: number = LIST_PAGE) {
  const [state, setState] = React.useState({ key, count: page })
  const limit = state.key === key ? state.count : page
  const more = React.useCallback(() => setState({ key, count: limit + page }), [key, limit, page])
  return [limit, more] as const
}

/**
 * "Mostrar mais": o resto da lista vem aos poucos — da memória ou, no histórico, do
 * banco. `remaining` é quanto falta, quando se sabe.
 */
export function ShowMore({
  remaining,
  step = LIST_PAGE,
  loading,
  onClick,
  className,
}: {
  remaining?: number
  step?: number
  loading?: boolean
  onClick: () => void
  className?: string
}) {
  const label = remaining === undefined ? "Mostrar mais" : `Mostrar mais ${Math.min(step, remaining)}${remaining > step ? ` de ${remaining}` : ""}`
  return (
    <div className={cn("mt-4 flex justify-center", className)}>
      <Button variant="secondary" size="sm" onClick={onClick} disabled={loading} aria-busy={loading || undefined}>
        {loading ? "Carregando…" : label}
      </Button>
    </div>
  )
}

/** Histórico paginado no banco (`usePagedHistory`): o que falta além do que está na memória. */
export interface MoreFromServer {
  done: boolean
  loading: boolean
  more: () => void
}

/**
 * Desenha a lista aos poucos: primeiro o que já está na memória e, quando acaba,
 * a próxima página do banco (`server`). `total` é o tamanho real da lista, quando se sabe.
 */
export function LimitedList<T>({
  items,
  listKey,
  server,
  total,
  className,
  children,
}: {
  items: T[]
  listKey: string
  server?: MoreFromServer
  total?: number
  className?: string
  children: (visible: T[]) => React.ReactNode
}) {
  const [limit, showMore] = useRenderLimit(listKey)
  const visible = items.length > limit ? items.slice(0, limit) : items
  const hidden = items.length - visible.length
  const fetchable = !!server && !server.done
  const remaining = total !== undefined ? Math.max(total - visible.length, 0) : hidden > 0 && !fetchable ? hidden : undefined
  return (
    <>
      {children(visible)}
      {(hidden > 0 || fetchable) && remaining !== 0 && (
        <ShowMore
          className={className}
          remaining={remaining}
          loading={server?.loading}
          onClick={() => {
            if (hidden <= 0 && server && fetchable) server.more()
            showMore()
          }}
        />
      )}
    </>
  )
}
