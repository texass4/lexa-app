"use client"

import { X, Minus, Plus } from "lucide-react"
import { useStore, brl } from "./store"
import { PRODUCT, VARIANTS } from "./data"
import { THEME, ProductArt, Anno } from "./ui"

export function CartSheet() {
  const { sheetOpen, closeSheet, sheetIntent, variant, setVariant, qty, setQty, addToCart, go } = useStore()
  const v = VARIANTS[variant]
  const unavailable = v.stock === 0

  function confirm() {
    if (unavailable) return
    if (sheetIntent === "buy") {
      closeSheet()
      go("checkout")
    } else {
      addToCart()
      closeSheet()
    }
  }

  return (
    <div className={`absolute inset-0 z-40 transition-opacity duration-200 ${sheetOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      {/* Overlay escurecido */}
      <button aria-label="Fechar" onClick={closeSheet} className="absolute inset-0" style={{ background: "rgba(0,0,0,.45)" }} />

      {/* Painel inferior */}
      <div
        className={`absolute inset-x-0 bottom-0 rounded-t-2xl transition-transform duration-250 ${sheetOpen ? "translate-y-0" : "translate-y-full"}`}
        style={{ background: THEME.surface }}
      >
        <div className="relative px-4 pt-4">
          <button onClick={closeSheet} aria-label="Fechar" className="absolute right-3 top-3">
            <X size={22} style={{ color: THEME.muted }} />
          </button>

          {/* Produto + preço */}
          <div className="flex gap-3 pr-6">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl" style={{ background: THEME.bg }}>
              <ProductArt color={v.art} size={82} />
            </div>
            <div className="min-w-0">
              <div className="flex items-end gap-1" style={{ color: THEME.accentDeep }}>
                <span className="text-[13px] font-semibold">R$</span>
                <span className="text-[26px] font-extrabold leading-none">{PRODUCT.priceFrom}</span>
                <span className="mb-0.5 text-[12px] line-through" style={{ color: THEME.faint }}>R$ {PRODUCT.originalLabel}</span>
                <span className="mb-0.5 ml-1 rounded px-1 text-[11px] font-bold text-white" style={{ background: THEME.accent }}>-{PRODUCT.discountPct}%</span>
              </div>
              <div className="mt-1 text-[12px]" style={{ color: THEME.muted }}>
                <span className="font-semibold" style={{ color: "#17a34a" }}>Frete grátis</span> · Devolução gratuita
                <Anno n={5} label="Redução de risco" note="Repetir frete e devolução grátis no momento da escolha reduz o medo de errar." />
              </div>
              <div className="mt-1 text-[12px]" style={{ color: THEME.muted }}>Selecionado: {v.label}</div>
            </div>
          </div>

          {/* Cores */}
          <div className="py-4">
            <div className="mb-2 text-[13px] font-semibold" style={{ color: THEME.ink }}>Cor</div>
            <div className="flex gap-2">
              {VARIANTS.map((opt, i) => {
                const selected = i === variant
                const out = opt.stock === 0
                return (
                  <button
                    key={opt.id}
                    onClick={() => setVariant(i)}
                    className="relative flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[12px]"
                    style={{
                      borderColor: selected ? THEME.accent : THEME.line,
                      background: selected ? "#fff2ee" : THEME.surface,
                      color: out ? THEME.faint : THEME.ink,
                    }}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded" style={{ background: THEME.bg, opacity: out ? 0.5 : 1 }}>
                      <ProductArt color={opt.art} size={26} />
                    </span>
                    {out ? <span className="text-[11px]">{opt.label}</span> : <span>{opt.label}</span>}
                    {out ? <span className="absolute inset-0 flex items-center justify-center rounded-lg text-[10px] font-semibold" style={{ background: "rgba(255,255,255,.82)", color: THEME.muted }}>esgotado</span> : null}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quantidade */}
          <div className="flex items-center justify-between border-t py-4" style={{ borderColor: THEME.line }}>
            <span className="text-[13px] font-semibold" style={{ color: THEME.ink }}>Quantidade</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(qty - 1)} disabled={qty <= 1} className="flex h-7 w-7 items-center justify-center rounded-full border disabled:opacity-40" style={{ borderColor: THEME.line }}>
                <Minus size={14} style={{ color: THEME.ink }} />
              </button>
              <span className="w-6 text-center text-[15px] font-semibold tabular-nums" style={{ color: THEME.ink }}>{qty}</span>
              <button onClick={() => setQty(qty + 1)} className="flex h-7 w-7 items-center justify-center rounded-full border" style={{ borderColor: THEME.line }}>
                <Plus size={14} style={{ color: THEME.ink }} />
              </button>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-4 pb-6 pt-1">
          <button
            onClick={confirm}
            disabled={unavailable}
            className="w-full rounded-full py-3 text-[15px] font-bold text-white disabled:opacity-50"
            style={{ background: THEME.accent }}
          >
            {unavailable ? "Indisponível" : sheetIntent === "buy" ? `Comprar agora · ${brl(PRODUCT.price * qty)}` : "Adicionar à sacola"}
          </button>
        </div>
      </div>
    </div>
  )
}
