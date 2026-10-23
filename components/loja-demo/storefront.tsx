"use client"

import { useState } from "react"
import { Lightbulb, LightbulbOff } from "lucide-react"
import { StoreProvider, useStore, type Screen } from "./store"
import { StatusBar, THEME } from "./ui"
import { CartSheet } from "./cart-sheet"
import { BRAND, TRIGGERS } from "./data"
import { ProdutoScreen } from "./screens/produto"
import { LojaScreen } from "./screens/loja"
import { AvaliacoesScreen } from "./screens/avaliacoes"
import { DescricaoScreen } from "./screens/descricao"
import { ChatScreen } from "./screens/chat"
import { CheckoutScreen } from "./screens/checkout"
import { EnderecoScreen } from "./screens/endereco"

const SCREENS: { id: Screen; label: string }[] = [
  { id: "produto", label: "Produto" },
  { id: "loja", label: "Loja" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "descricao", label: "Descrição" },
  { id: "chat", label: "Chat" },
  { id: "checkout", label: "Resumo do pedido" },
  { id: "endereco", label: "Endereço" },
]

function ScreenRouter() {
  const { screen } = useStore()
  switch (screen) {
    case "loja": return <LojaScreen />
    case "avaliacoes": return <AvaliacoesScreen />
    case "descricao": return <DescricaoScreen />
    case "chat": return <ChatScreen />
    case "checkout": return <CheckoutScreen />
    case "endereco": return <EnderecoScreen />
    default: return <ProdutoScreen />
  }
}

function Toast() {
  const { toast } = useStore()
  return (
    <div className={`pointer-events-none absolute bottom-24 left-1/2 z-50 -translate-x-1/2 transition-all ${toast ? "opacity-100" : "translate-y-2 opacity-0"}`}>
      {toast ? <div className="max-w-[80%] rounded-full px-4 py-2 text-center text-[12px] text-white" style={{ background: "rgba(0,0,0,.82)" }}>{toast}</div> : null}
    </div>
  )
}

function Controls() {
  const { screen, go, annotations, toggleAnnotations } = useStore()
  return (
    <div className="mx-auto mb-3 flex w-full max-w-[420px] flex-wrap items-center gap-1.5">
      {SCREENS.map((s) => (
        <button
          key={s.id}
          onClick={() => go(s.id)}
          className="rounded-full px-2.5 py-1 text-[12px] transition-colors"
          style={{
            background: screen === s.id ? THEME.accent : "#ffffff",
            color: screen === s.id ? "#fff" : THEME.ink,
            border: `1px solid ${screen === s.id ? THEME.accent : THEME.line}`,
          }}
        >
          {s.label}
        </button>
      ))}
      <button
        onClick={toggleAnnotations}
        className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold"
        style={{ background: annotations ? THEME.anno : "#fff", color: annotations ? "#fff" : THEME.anno, border: `1px solid ${THEME.anno}` }}
      >
        {annotations ? <LightbulbOff size={14} /> : <Lightbulb size={14} />}
        Gatilhos
      </button>
    </div>
  )
}

function Legend() {
  const { annotations } = useStore()
  const [open, setOpen] = useState(true)
  if (!annotations) return null
  return (
    <div className="mx-auto mt-5 w-full max-w-[520px] rounded-2xl border bg-white p-4 text-left" style={{ borderColor: THEME.line }}>
      <button onClick={() => setOpen((o) => !o)} className="mb-2 flex w-full items-center justify-between">
        <span className="text-[14px] font-bold" style={{ color: THEME.ink }}>Gatilhos de conversão nesta tela</span>
        <span className="text-[12px]" style={{ color: THEME.anno }}>{open ? "ocultar" : "mostrar"}</span>
      </button>
      {open ? (
        <ul className="space-y-2">
          {TRIGGERS.map((t) => (
            <li key={t.id} className="flex gap-2 text-[12.5px] leading-snug">
              <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: THEME.anno }}>{t.id}</span>
              <span style={{ color: "#4b4d55" }}><b style={{ color: THEME.ink }}>{t.name}.</b> {t.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[11px]" style={{ color: THEME.faint }}>
        Toque nos marcadores <span className="font-bold" style={{ color: THEME.anno }}>①</span> dentro da tela para ver cada gatilho em contexto.
      </p>
    </div>
  )
}

function Device() {
  return (
    <div className="mx-auto w-full max-w-[390px]">
      {/* Moldura */}
      <div className="relative overflow-hidden rounded-[36px] border-[10px] bg-white shadow-2xl" style={{ borderColor: "#111214", height: "min(78vh, 780px)" }}>
        <div className="flex h-full flex-col">
          <StatusBar />
          <div className="relative flex-1 overflow-hidden">
            <ScreenRouter />
            <CartSheet />
            <Toast />
          </div>
        </div>
      </div>
    </div>
  )
}

export function Storefront() {
  return (
    <StoreProvider>
      <div className="min-h-dvh px-4 py-6" style={{ background: "#ececed" }}>
        <div className="mx-auto mb-5 max-w-[520px] text-center">
          <h1 className="text-[20px] font-extrabold" style={{ color: THEME.ink }}>{BRAND.marketplace} · demo de loja mobile</h1>
          <p className="mt-1 text-[13px]" style={{ color: THEME.muted }}>
            Reconstrução de layout e <b>estudo de gatilhos de conversão</b>. Loja e produtos fictícios; nada é cobrado, enviado ou salvo.
          </p>
        </div>
        <Controls />
        <Device />
        <Legend />
      </div>
    </StoreProvider>
  )
}
