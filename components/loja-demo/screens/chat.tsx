"use client"

import { useState } from "react"
import { Smile, Plus, Send, Bot } from "lucide-react"
import { useStore } from "../store"
import { BRAND, PRODUCT, SUGGESTED_QUESTIONS } from "../data"
import { THEME, TopBar, ProductArt } from "../ui"

type Msg = { from: "bot" | "me"; text: string }

const AUTO: Record<string, string> = {
  "Qual o prazo de entrega?": `Seu pedido chega entre ${PRODUCT.deliveryWindow}. O frete está grátis para esta oferta! 🚚`,
  "Tem garantia?": "Sim — 90 dias de garantia contra defeitos de fabricação, direto com a loja.",
  "Como funciona a devolução gratuita?": "Você tem 7 dias para devolver sem custo. É só abrir a solicitação no pedido. 🙂",
  "Vem com cerdas extras?": "Vem! Acompanha 4 refis de cerdas macias e um estojo de viagem.",
}

export function ChatScreen() {
  const { go } = useStore()
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: `Olá! Sou o assistente da ${BRAND.store}. Como posso ajudar com este produto?` },
  ])
  const [draft, setDraft] = useState("")

  function send(text: string) {
    const t = text.trim()
    if (!t) return
    setDraft("")
    setMsgs((m) => [...m, { from: "me", text: t }])
    const reply = AUTO[t] ?? "Obrigado pela mensagem! Um atendente responde em instantes. (resposta automática · demonstração)"
    window.setTimeout(() => setMsgs((m) => [...m, { from: "bot", text: reply }]), 500)
  }

  return (
    <div className="flex h-full flex-col" style={{ background: THEME.bg }}>
      <TopBar
        title={
          <span className="flex items-center justify-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: THEME.accent }}>S</span>
            {BRAND.store}
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#17a34a" }} />
          </span>
        }
      />

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="text-center text-[11px]" style={{ color: THEME.faint }}>Conversa demonstrativa — nenhuma mensagem é enviada a um servidor</div>

        {msgs.map((m, i) =>
          m.from === "bot" ? (
            <div key={i} className="flex max-w-[82%] gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: THEME.accent }}><Bot size={13} /></span>
              <div>
                <div className="mb-0.5 flex items-center gap-1 text-[10px]" style={{ color: THEME.faint }}><Bot size={10} /> chatbot</div>
                <div className="rounded-2xl rounded-tl-sm px-3 py-2 text-[13px]" style={{ background: THEME.surface, color: THEME.ink }}>{m.text}</div>
              </div>
            </div>
          ) : (
            <div key={i} className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm px-3 py-2 text-[13px] text-white" style={{ background: THEME.accent }}>{m.text}</div>
          ),
        )}

        {/* Cartão do produto anexado */}
        <div className="flex gap-2 rounded-xl p-2" style={{ background: THEME.surface }}>
          <div className="flex h-16 w-16 items-center justify-center rounded-lg" style={{ background: THEME.bg }}><ProductArt color="#2b2b2f" size={48} /></div>
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[12px] leading-tight" style={{ color: THEME.ink }}>{PRODUCT.name}</div>
            <div className="mt-1 flex items-end gap-1" style={{ color: THEME.accentDeep }}>
              <span className="text-[11px] font-semibold">R$</span><span className="text-[16px] font-extrabold leading-none">{PRODUCT.priceFrom}</span>
              <span className="mb-0.5 text-[10px] line-through" style={{ color: THEME.faint }}>R$ {PRODUCT.originalLabel}</span>
            </div>
          </div>
          <button onClick={() => go("produto")} className="self-center rounded-full px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: THEME.accent }}>Ver</button>
        </div>

        {/* Perguntas sugeridas */}
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button key={q} onClick={() => send(q)} className="rounded-full border px-3 py-1.5 text-[12px]" style={{ borderColor: THEME.accent, color: THEME.accentDeep, background: THEME.surface }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Campo de mensagem */}
      <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: THEME.line, background: THEME.surface }}>
        <Plus size={22} style={{ color: THEME.muted }} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(draft)}
          placeholder="Escreva uma mensagem"
          className="flex-1 rounded-full px-3 py-2 text-[13px] outline-none"
          style={{ background: THEME.bg, color: THEME.ink }}
        />
        <Smile size={22} style={{ color: THEME.muted }} />
        <button onClick={() => send(draft)} aria-label="Enviar" className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: draft.trim() ? THEME.accent : THEME.faint }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
