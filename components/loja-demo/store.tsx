"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { PRODUCT, VARIANTS } from "./data"

export type Screen = "loja" | "produto" | "avaliacoes" | "descricao" | "chat" | "checkout" | "endereco"

type CartLine = { variant: number; qty: number }

type StoreState = {
  screen: Screen
  go: (s: Screen) => void
  back: () => void
  canBack: boolean

  annotations: boolean
  toggleAnnotations: () => void

  variant: number
  setVariant: (i: number) => void
  qty: number
  setQty: (n: number) => void

  cart: CartLine[]
  cartCount: number
  addToCart: () => void

  sheetOpen: boolean
  openSheet: (intent?: "cart" | "buy") => void
  closeSheet: () => void
  sheetIntent: "cart" | "buy"

  toast: string | null
  flash: (msg: string) => void
}

const Ctx = createContext<StoreState | null>(null)

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useStore fora do StoreProvider")
  return v
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<Screen[]>(["produto"])
  const [annotations, setAnnotations] = useState(false)
  const [variant, setVariant] = useState(1) // branco, como nas referências
  const [qty, setQty] = useState(1)
  const [cart, setCart] = useState<CartLine[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetIntent, setSheetIntent] = useState<"cart" | "buy">("cart")
  const [toast, setToast] = useState<string | null>(null)

  const screen = history[history.length - 1]

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800)
  }, [])

  const go = useCallback((s: Screen) => {
    setSheetOpen(false)
    setHistory((h) => (h[h.length - 1] === s ? h : [...h, s]))
  }, [])
  const back = useCallback(() => {
    setSheetOpen(false)
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))
  }, [])

  const openSheet = useCallback((intent: "cart" | "buy" = "cart") => {
    setSheetIntent(intent)
    setSheetOpen(true)
  }, [])
  const closeSheet = useCallback(() => setSheetOpen(false), [])

  const addToCart = useCallback(() => {
    setCart((c) => {
      const i = c.findIndex((l) => l.variant === variant)
      if (i >= 0) {
        const next = [...c]
        next[i] = { ...next[i], qty: next[i].qty + qty }
        return next
      }
      return [...c, { variant, qty }]
    })
    flash(`${VARIANTS[variant].label} · ${qty}× adicionado à sacola`)
  }, [variant, qty, flash])

  const cartCount = cart.reduce((s, l) => s + l.qty, 0)

  const value = useMemo<StoreState>(
    () => ({
      screen,
      go,
      back,
      canBack: history.length > 1,
      annotations,
      toggleAnnotations: () => setAnnotations((a) => !a),
      variant,
      setVariant,
      qty,
      setQty: (n) => setQty(Math.max(1, n)),
      cart,
      cartCount,
      addToCart,
      sheetOpen,
      openSheet,
      closeSheet,
      sheetIntent,
      toast,
      flash,
    }),
    [screen, go, back, history.length, annotations, variant, qty, cart, cartCount, addToCart, sheetOpen, openSheet, closeSheet, sheetIntent, toast, flash],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Helpers de formatação (demonstrativos).
export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export const unitPrice = PRODUCT.price
