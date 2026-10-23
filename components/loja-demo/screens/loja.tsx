"use client"

import { useState } from "react"
import { ChevronLeft, Search, ShoppingCart, Plus, Ticket } from "lucide-react"
import { useStore } from "../store"
import { BRAND, CATALOG } from "../data"
import { THEME, ProductArt, Stars, Anno } from "../ui"

const TABS = ["Início", "Produtos", "Novidades", "Categorias"]

export function LojaScreen() {
  const { back, go, cartCount, openSheet } = useStore()
  const [tab, setTab] = useState(0)
  const [following, setFollowing] = useState(false)

  return (
    <div className="flex h-full flex-col" style={{ background: THEME.bg }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-2" style={{ background: THEME.surface }}>
        <button onClick={back} aria-label="Voltar" className="p-1"><ChevronLeft size={24} style={{ color: THEME.ink }} /></button>
        <div className="flex flex-1 items-center gap-2 rounded-full px-3 py-1.5" style={{ background: THEME.bg }}>
          <Search size={15} style={{ color: THEME.muted }} />
          <span className="text-[13px]" style={{ color: THEME.muted }}>buscar na loja</span>
        </div>
        <div className="relative p-1">
          <ShoppingCart size={20} style={{ color: THEME.ink }} />
          {cartCount > 0 ? <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: THEME.accent }}>{cartCount}</span> : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Banner da loja */}
        <div className="px-4 py-4" style={{ background: THEME.surface }}>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full text-[20px] font-black text-white" style={{ background: THEME.accent }}>S</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-bold" style={{ color: THEME.ink }}>{BRAND.store}</div>
              <div className="flex items-center gap-1.5 text-[12px]" style={{ color: THEME.muted }}>
                <Stars value={5} size={11} />
                <span className="font-semibold" style={{ color: THEME.ink }}>{BRAND.storeRating}</span>
                <span>· {BRAND.followers} seguidores</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setFollowing((f) => !f)}
              className="flex-1 rounded-full py-1.5 text-[13px] font-semibold text-white"
              style={{ background: following ? THEME.faint : THEME.accent }}
            >
              {following ? "Seguindo" : "+ Seguir"}
            </button>
            <button onClick={() => go("chat")} className="flex-1 rounded-full border py-1.5 text-[13px] font-semibold" style={{ borderColor: THEME.line, color: THEME.ink }}>
              Mensagem
            </button>
          </div>
        </div>

        {/* Cupom de frete */}
        <div className="mx-4 my-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: "#fff2ee", color: THEME.accentDeep }}>
          <Ticket size={16} />
          <span className="flex-1">Cupom de <b>frete grátis</b> acima de R$ 15 — aplicado automaticamente</span>
          <Anno n={5} label="Redução de risco" note="Cupom de frete grátis destaca a vantagem e incentiva aumentar o carrinho." />
        </div>

        {/* Abas */}
        <div className="flex gap-4 border-b px-4" style={{ borderColor: THEME.line, background: THEME.surface }}>
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className="relative py-2.5 text-[14px]"
              style={{ color: i === tab ? THEME.ink : THEME.muted, fontWeight: i === tab ? 700 : 400 }}
            >
              {t}
              {i === tab ? <span className="absolute inset-x-0 -bottom-px mx-auto h-0.5 w-6 rounded-full" style={{ background: THEME.accent }} /> : null}
            </button>
          ))}
        </div>

        {/* Grade de produtos */}
        <div className="grid grid-cols-2 gap-2 p-2">
          {CATALOG.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => (idx === 0 ? go("produto") : openSheet("cart"))}
              className="overflow-hidden rounded-xl text-left"
              style={{ background: THEME.surface }}
            >
              <div className="flex h-36 items-center justify-center" style={{ background: THEME.bg }}>
                <ProductArt color={p.art} size={110} />
              </div>
              <div className="p-2">
                <div className="line-clamp-2 h-9 text-[12px] leading-tight" style={{ color: THEME.ink }}>{p.name}</div>
                <div className="mt-1 flex items-end gap-1" style={{ color: THEME.accentDeep }}>
                  <span className="text-[11px] font-semibold">R$</span>
                  <span className="text-[17px] font-extrabold leading-none">{p.price}</span>
                  <span className="mb-0.5 rounded px-1 text-[9px] font-bold text-white" style={{ background: THEME.accent }}>-{p.off}%</span>
                </div>
                <div className="text-[10px] line-through" style={{ color: THEME.faint }}>R$ {p.original}</div>
                <div className="mt-1 flex items-center justify-between text-[10px]" style={{ color: THEME.muted }}>
                  <span className="flex items-center gap-0.5"><Stars value={5} size={9} />{p.rating}</span>
                  <span>{p.sold} vendidos</span>
                </div>
              </div>
              <div className="flex items-center justify-end px-2 pb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ background: THEME.accent }}><Plus size={14} /></span>
              </div>
            </button>
          ))}
        </div>
        <div className="py-5 text-center text-[11px]" style={{ color: THEME.faint }}>Vitrine demonstrativa · produtos fictícios</div>
      </div>
    </div>
  )
}
