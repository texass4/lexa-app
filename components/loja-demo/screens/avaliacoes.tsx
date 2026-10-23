"use client"

import { useState } from "react"
import { ImageIcon } from "lucide-react"
import { useStore } from "../store"
import { PRODUCT, REVIEWS } from "../data"
import { THEME, TopBar, Stars, ProductArt, Anno } from "../ui"

const TABS = ["Visão geral", "Avaliações", "Descrição", "Recomendações"]
const FILTERS = ["Tudo", "5★", "4★", "Com foto", "Com vídeo"]

export function AvaliacoesScreen() {
  const { go } = useStore()
  const [filter, setFilter] = useState(0)

  return (
    <div className="flex h-full flex-col" style={{ background: THEME.bg }}>
      <TopBar title="Avaliações" />
      <ProductTabs active={1} go={go} />

      <div className="flex-1 overflow-y-auto">
        {/* Resumo */}
        <div className="flex items-center gap-4 px-4 py-4" style={{ background: THEME.surface }}>
          <div className="text-center">
            <div className="text-[32px] font-extrabold leading-none" style={{ color: THEME.ink }}>{PRODUCT.rating}</div>
            <Stars value={5} />
          </div>
          <div className="text-[12px]" style={{ color: THEME.muted }}>
            <div>{PRODUCT.ratingCount} avaliações · 98% positivas</div>
            <div className="mt-0.5">
              {PRODUCT.sold} vendidos
              <Anno n={3} label="Prova social" note="Nota alta somada a milhares de avaliações é um dos gatilhos de confiança mais fortes." />
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 overflow-x-auto px-4 py-2" style={{ background: THEME.surface }}>
          {FILTERS.map((f, i) => (
            <button
              key={f}
              onClick={() => setFilter(i)}
              className="whitespace-nowrap rounded-full px-3 py-1 text-[12px]"
              style={{
                background: i === filter ? "#fff2ee" : THEME.bg,
                color: i === filter ? THEME.accentDeep : THEME.muted,
                border: `1px solid ${i === filter ? THEME.accent : "transparent"}`,
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="mt-2 divide-y" style={{ background: THEME.surface, borderColor: THEME.line }}>
          {REVIEWS.map((r) => (
            <div key={r.author} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: THEME.faint }}>
                  {r.author[0]}
                </span>
                <span className="text-[13px] font-medium" style={{ color: THEME.ink }}>{r.author}</span>
                <span className="ml-auto"><Stars value={r.stars} size={12} /></span>
              </div>
              <div className="mt-1 text-[11px]" style={{ color: THEME.muted }}>Variante: {r.variant}</div>
              <p className="mt-1 text-[13px] leading-snug" style={{ color: THEME.ink }}>{r.text}</p>
              {r.photos > 0 ? (
                <div className="mt-2 flex gap-2">
                  {Array.from({ length: r.photos }).map((_, i) => (
                    <div key={i} className="flex h-16 w-16 items-center justify-center rounded-lg" style={{ background: THEME.bg }}>
                      <ProductArt color={["#2b2b2f", "#f3f4f6", "#f6c8d4"][i % 3]} size={44} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: THEME.faint }}>
                  <ImageIcon size={12} /> sem foto
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="py-5 text-center text-[11px]" style={{ color: THEME.faint }}>Avaliações fictícias para estudo</div>
      </div>
    </div>
  )
}

export function ProductTabs({ active, go }: { active: number; go: (s: "produto" | "avaliacoes" | "descricao") => void }) {
  const map: Record<number, "produto" | "avaliacoes" | "descricao"> = { 0: "produto", 1: "avaliacoes", 2: "descricao", 3: "produto" }
  return (
    <div className="flex gap-4 border-b px-4" style={{ borderColor: THEME.line, background: THEME.surface }}>
      {TABS.map((t, i) => (
        <button key={t} onClick={() => go(map[i])} className="relative py-2.5 text-[13px]" style={{ color: i === active ? THEME.ink : THEME.muted, fontWeight: i === active ? 700 : 400 }}>
          {t}
          {i === active ? <span className="absolute inset-x-0 -bottom-px mx-auto h-0.5 w-5 rounded-full" style={{ background: THEME.accent }} /> : null}
        </button>
      ))}
    </div>
  )
}
