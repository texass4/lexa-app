"use client"

import { Play, Store, MessageCircle, ShoppingCart } from "lucide-react"
import { useStore } from "../store"
import { PRODUCT } from "../data"
import { THEME, TopBar, ProductArt, Anno } from "../ui"
import { ProductTabs } from "./avaliacoes"

export function DescricaoScreen() {
  const { go, openSheet } = useStore()
  return (
    <div className="flex h-full flex-col" style={{ background: THEME.surface }}>
      <TopBar title="Descrição" />
      <ProductTabs active={2} go={go} />

      <div className="flex-1 overflow-y-auto">
        {/* Vídeo */}
        <div className="relative flex h-52 items-center justify-center" style={{ background: "#0f1115" }}>
          <ProductArt color="#e5e7eb" size={150} />
          <button className="absolute flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.9)" }}>
            <Play size={24} className="translate-x-0.5" style={{ color: THEME.ink }} fill="currentColor" />
          </button>
          <span className="absolute bottom-2 right-3 rounded px-1.5 py-0.5 text-[11px] text-white" style={{ background: "rgba(0,0,0,.5)" }}>0:42</span>
        </div>

        <div className="px-4 py-4">
          <h2 className="text-[16px] font-bold" style={{ color: THEME.ink }}>{PRODUCT.name}</h2>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "#4b4d55" }}>
            Escova dental elétrica com motor sônico de alta rotação e <b>6 modos de limpeza</b> (limpeza,
            branqueamento, massagem, sensível, polimento e cuidado gengival). Carregamento por cabo USB
            com autonomia de até 30 dias por carga. Corpo <b>à prova d&apos;água IPX7</b>, ideal para uso no
            banho e em viagens.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
            {[
              ["Modos", "6 engrenagens"],
              ["Bateria", "Recarregável USB"],
              ["Autonomia", "Até 30 dias"],
              ["Proteção", "À prova d'água"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg p-3" style={{ background: THEME.bg }}>
                <div style={{ color: THEME.muted }}>{k}</div>
                <div className="mt-0.5 font-semibold" style={{ color: THEME.ink }}>{v}</div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "#4b4d55" }}>
            Acompanha 4 refis de cerdas macias e estojo de viagem. Indicada para toda a família — basta
            trocar a cabeça da escova. A pressão inteligente avisa quando a força está excessiva,
            protegendo o esmalte e a gengiva.
          </p>
        </div>
      </div>

      {/* Barra inferior */}
      <div className="relative flex items-stretch gap-1 border-t px-2 py-2" style={{ borderColor: THEME.line }}>
        <span className="absolute -top-3 right-3"><Anno n={7} label="CTA sempre à mão" note="Mesmo na aba de descrição, a compra continua a um toque de distância." /></span>
        <button onClick={() => go("loja")} className="flex flex-col items-center px-3"><Store size={20} style={{ color: THEME.ink }} /><span className="text-[10px]" style={{ color: THEME.muted }}>Loja</span></button>
        <button onClick={() => go("chat")} className="flex flex-col items-center px-3"><MessageCircle size={20} style={{ color: THEME.ink }} /><span className="text-[10px]" style={{ color: THEME.muted }}>Chat</span></button>
        <button onClick={() => openSheet("cart")} className="flex items-center justify-center rounded-full px-4" style={{ background: "#ffe3d8", color: THEME.accentDeep }}><ShoppingCart size={20} /></button>
        <button onClick={() => openSheet("buy")} className="flex flex-1 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ background: THEME.accent }}>Compre</button>
      </div>
    </div>
  )
}
