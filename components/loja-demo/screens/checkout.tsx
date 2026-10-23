"use client"

import { useState } from "react"
import { ChevronLeft, Star, MapPin, Plus, Minus, ChevronRight, CreditCard, Smartphone, QrCode, ChevronUp } from "lucide-react"
import { useStore, brl } from "../store"
import { BRAND, PRODUCT, VARIANTS } from "../data"
import { THEME, ProductArt, Anno } from "../ui"

const PAYMENTS = [
  { id: "card", label: "Cartão de crédito", icon: CreditCard, hint: "Mastercard · Visa · Elo · Amex" },
  { id: "apple", label: "Apple Pay", icon: Smartphone },
  { id: "pix", label: "Pix", icon: QrCode },
]

export function CheckoutScreen() {
  const { back, go, variant, qty, setQty, flash } = useStore()
  const [pay, setPay] = useState("pix")
  const v = VARIANTS[variant]
  const subtotal = PRODUCT.price * qty
  const original = PRODUCT.original * qty
  const discount = original - subtotal

  return (
    <div className="flex h-full flex-col" style={{ background: THEME.bg }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-2.5" style={{ background: THEME.surface }}>
        <button onClick={back} aria-label="Voltar" className="p-1"><ChevronLeft size={24} style={{ color: THEME.ink }} /></button>
        <div className="flex flex-1 items-center justify-center gap-1 text-[14px] font-semibold" style={{ color: THEME.ink }}>
          <Star size={15} fill="#f5a623" style={{ color: "#f5a623" }} /> {BRAND.storeRatingLabel} {BRAND.storeRating}
        </div>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Banner demo */}
        <div className="px-4 py-1.5 text-center text-[11px]" style={{ background: "#fff8e6", color: "#8a6d1a" }}>
          Resumo de pedido demonstrativo — nenhuma cobrança é feita e nenhum dado é enviado
        </div>

        {/* Endereço */}
        <button onClick={() => go("endereco")} className="flex w-full items-center gap-2 px-4 py-3" style={{ background: THEME.surface }}>
          <MapPin size={18} style={{ color: THEME.ink }} />
          <span className="flex-1 text-left text-[14px] font-semibold" style={{ color: THEME.ink }}>Endereço de envio</span>
          <span className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: THEME.accent }}><Plus size={15} /> Adicionar endereço</span>
        </button>

        <div style={{ height: 8, background: THEME.bg }} />

        {/* Loja + produto */}
        <div className="px-4 py-3" style={{ background: THEME.surface }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[14px] font-bold" style={{ color: THEME.ink }}>{BRAND.store}</span>
            <span className="flex items-center gap-1 text-[12px]" style={{ color: THEME.muted }}>Adicionar nota <ChevronRight size={14} /></span>
          </div>
          <div className="flex gap-3">
            <div className="flex h-20 w-20 items-center justify-center rounded-lg" style={{ background: THEME.bg }}><ProductArt color={v.art} size={60} /></div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[13px] leading-tight" style={{ color: THEME.ink }}>{PRODUCT.name}</div>
              <div className="mt-1 flex gap-1 text-[10px]">
                <span className="rounded px-1 py-0.5 font-medium" style={{ background: "#fff2ee", color: THEME.accentDeep }}>Oferta</span>
                <span className="rounded px-1 py-0.5 font-medium" style={{ background: "#eafaf0", color: "#17a34a" }}>Devolução gratuita</span>
              </div>
              <div className="mt-1 text-[11px]" style={{ color: THEME.muted }}>{v.label}</div>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-end gap-1" style={{ color: THEME.accentDeep }}>
                  <span className="text-[16px] font-extrabold leading-none">R$ {PRODUCT.priceFrom}</span>
                  <span className="mb-0.5 text-[10px] line-through" style={{ color: THEME.faint }}>R$ {PRODUCT.originalLabel}</span>
                  <span className="mb-0.5 text-[10px] font-bold" style={{ color: THEME.accent }}>-{PRODUCT.discountPct}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(qty - 1)} disabled={qty <= 1} className="flex h-6 w-6 items-center justify-center rounded border disabled:opacity-40" style={{ borderColor: THEME.line }}><Minus size={12} /></button>
                  <span className="w-5 text-center text-[13px] font-semibold tabular-nums" style={{ color: THEME.ink }}>{qty}</span>
                  <button onClick={() => setQty(qty + 1)} className="flex h-6 w-6 items-center justify-center rounded border" style={{ borderColor: THEME.line }}><Plus size={12} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 8, background: THEME.bg }} />

        {/* Resumo financeiro */}
        <div className="px-4 py-3 text-[13px]" style={{ background: THEME.surface }}>
          <div className="mb-2 flex items-center gap-1 font-bold" style={{ color: THEME.ink }}>Subtotal do produto <ChevronUp size={14} /><span className="ml-auto">{brl(subtotal)}</span></div>
          <div className="flex justify-between py-0.5" style={{ color: THEME.muted }}><span>Preço original</span><span>{brl(original)}</span></div>
          <div className="flex justify-between py-0.5">
            <span style={{ color: THEME.muted }}>Desconto no produto <Anno n={1} label="Ancoragem de preço" note="Mostrar o preço original e o desconto em linhas separadas reforça o tamanho da vantagem." /></span>
            <span style={{ color: THEME.accent }}>- {brl(discount)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: THEME.line }}>
            <span className="text-[16px] font-bold" style={{ color: THEME.ink }}>Total</span>
            <div className="text-right">
              <div className="text-[16px] font-bold" style={{ color: THEME.ink }}>{brl(subtotal)}</div>
              <div className="text-[11px]" style={{ color: THEME.muted }}>Impostos inclusos</div>
            </div>
          </div>
        </div>

        <div style={{ height: 8, background: THEME.bg }} />

        {/* Pagamento */}
        <div className="px-4 py-3" style={{ background: THEME.surface }}>
          <div className="mb-2 flex items-center gap-1 text-[15px] font-bold" style={{ color: THEME.ink }}>
            Forma de pagamento
            <Anno n={9} label="Facilitação de pagamento" note="Oferecer Pix, Apple Pay e cartão reduz o atrito — sempre há um método conveniente." />
          </div>
          {PAYMENTS.map((p) => (
            <button key={p.id} onClick={() => setPay(p.id)} className="flex w-full items-center gap-3 py-2.5">
              <p.icon size={20} style={{ color: THEME.ink }} />
              <div className="flex-1 text-left">
                <div className="text-[14px]" style={{ color: THEME.ink }}>{p.label}</div>
                {p.hint ? <div className="text-[10px]" style={{ color: THEME.faint }}>{p.hint}</div> : null}
              </div>
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2" style={{ borderColor: pay === p.id ? THEME.accent : THEME.line }}>
                {pay === p.id ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: THEME.accent }} /> : null}
              </span>
            </button>
          ))}
          <button className="flex w-full items-center justify-between py-2 text-[13px] font-medium" style={{ color: THEME.ink }}>Ver todos <ChevronRight size={16} /></button>
        </div>

        {/* Termos + economia */}
        <div className="px-4 py-3 text-[11px] leading-snug" style={{ color: THEME.muted }}>
          Ao fazer um pedido, você concorda com os <b>Termos de uso e venda</b> da loja demonstrativa e reconhece a <b>Política de privacidade</b>.
        </div>
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "#fff2ee", color: THEME.accentDeep }}>
          😊 Você está economizando {brl(discount)} nesse pedido.
          <Anno n={6} label="Enquadramento de ganho" note="Reforçar quanto a pessoa economiza (e não quanto gasta) é um forte empurrão final." />
        </div>
      </div>

      {/* Barra inferior */}
      <div className="relative border-t px-3 py-2" style={{ borderColor: THEME.line, background: THEME.surface }}>
        <span className="absolute -top-3 right-3"><Anno n={4} label="Urgência / escassez" note='"A oferta termina em breve" cria pressão de tempo no último passo.' /></span>
        <div className="mb-1 flex items-center justify-between text-[13px]">
          <span style={{ color: THEME.ink }}>Total (1 item)</span>
          <span className="text-[17px] font-extrabold" style={{ color: THEME.accent }}>{brl(subtotal)}</span>
        </div>
        <button
          onClick={() => flash("Pedido de demonstração registrado — nenhuma cobrança foi feita")}
          className="w-full rounded-full py-2.5 text-center text-white"
          style={{ background: THEME.accent }}
        >
          <div className="text-[15px] font-bold">Fazer pedido</div>
          <div className="text-[10px] opacity-90">A oferta termina em breve</div>
        </button>
      </div>
    </div>
  )
}
