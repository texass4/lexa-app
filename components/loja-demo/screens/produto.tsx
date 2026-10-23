"use client"

import { X, Search, Share2, ShoppingCart, MoreHorizontal, Bookmark, Store, MessageCircle, Sparkles, Zap, Usb, ShieldCheck, Plane, Truck, ChevronRight } from "lucide-react"
import { useStore } from "../store"
import { PRODUCT, VARIANTS, BRAND } from "../data"
import { THEME, ProductArt, Stars, Anno } from "../ui"

const FEATURE_ICONS = [Sparkles, Zap, Usb, ShieldCheck, Plane]

export function ProdutoScreen() {
  const { openSheet, go, cartCount } = useStore()

  return (
    <div className="flex h-full flex-col" style={{ background: THEME.surface }}>
      {/* Header fixo */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: THEME.surface }}>
        <X size={22} style={{ color: THEME.ink }} />
        <div className="flex flex-1 items-center gap-2 rounded-full px-3 py-1.5" style={{ background: THEME.bg }}>
          <Search size={15} style={{ color: THEME.muted }} />
          <span className="truncate text-[13px]" style={{ color: THEME.muted }}>escova elétrica de de...</span>
        </div>
        <Share2 size={20} style={{ color: THEME.ink }} />
        <div className="relative">
          <ShoppingCart size={20} style={{ color: THEME.ink }} />
          {cartCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: THEME.accent }}>
              {cartCount}
            </span>
          ) : null}
        </div>
        <MoreHorizontal size={20} style={{ color: THEME.ink }} />
      </div>

      {/* Conteúdo rolável */}
      <div className="flex-1 overflow-y-auto">
        {/* Galeria */}
        <div className="relative" style={{ background: THEME.surface }}>
          <div className="flex items-center justify-center gap-3 py-6">
            {VARIANTS.map((v, i) => (
              <ProductArt key={v.id} color={v.art} size={168 - Math.abs(i - 1) * 6} className={i === 1 ? "" : "opacity-95"} />
            ))}
          </div>
          {/* Faixa de atributos */}
          <div className="flex items-center justify-between px-5 pb-4">
            {PRODUCT.features.map((f, i) => {
              const Ic = FEATURE_ICONS[i]
              return (
                <div key={f} className="flex w-[18%] flex-col items-center gap-1 text-center">
                  <Ic size={22} style={{ color: THEME.ink }} strokeWidth={1.6} />
                  <span className="text-[10px] leading-tight" style={{ color: THEME.ink }}>{f}</span>
                </div>
              )
            })}
          </div>
          <span className="absolute bottom-3 right-3 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: "rgba(0,0,0,.45)" }}>
            1/8
          </span>
        </div>

        {/* Faixa de oferta — ancoragem + desconto */}
        <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ background: THEME.sale }}>
          <span className="rounded px-1.5 py-0.5 text-[12px] font-bold" style={{ background: "rgba(255,255,255,.25)" }}>
            -{PRODUCT.discountPct}%
            <Anno n={2} label="Desconto em destaque" note='Selo "-73%" transforma o desconto em número grande e chamativo.' />
          </span>
          <span className="text-[13px]">A partir de R$</span>
          <span className="text-[26px] font-extrabold leading-none">{PRODUCT.priceFrom}</span>
          <span className="ml-auto text-right text-[13px] font-semibold">
            Oferta
            <Anno n={4} label="Urgência / escassez" note='Faixa "Oferta" e contagem de tempo pressionam a decisão imediata.' />
          </span>
        </div>
        <div className="px-4 py-1 text-[12px]" style={{ background: "#fff2ee", color: THEME.accentDeep }}>
          <span className="line-through" style={{ color: THEME.faint }}>R$ {PRODUCT.originalLabel}</span>
          <span className="ml-1 font-medium">
            preço original
            <Anno n={1} label="Ancoragem de preço" note="Preço cheio riscado ao lado do promocional faz o valor parecer uma pechincha." />
          </span>
        </div>

        {/* Título + salvar */}
        <div className="flex items-start gap-2 px-4 py-3">
          <h1 className="flex-1 text-[16px] font-semibold leading-snug" style={{ color: THEME.ink }}>{PRODUCT.name}</h1>
          <Bookmark size={20} style={{ color: THEME.muted }} />
        </div>

        {/* Avaliação + vendidos — prova social */}
        <div className="flex items-center gap-2 px-4 pb-3 text-[13px]">
          <Stars value={5} />
          <span className="font-semibold" style={{ color: THEME.ink }}>{PRODUCT.rating}</span>
          <button onClick={() => go("avaliacoes")} className="underline-offset-2" style={{ color: "#2f6fed" }}>({PRODUCT.ratingCount})</button>
          <span style={{ color: THEME.line }}>|</span>
          <span style={{ color: THEME.muted }}>
            {PRODUCT.sold} vendidos
            <Anno n={3} label="Prova social" note='"121 mil vendidos" e a nota com milhares de avaliações mostram que muita gente já aprovou.' />
          </span>
        </div>

        <div style={{ height: 8, background: THEME.bg }} />

        {/* Frete + entrega — redução de risco */}
        <div className="flex items-center gap-2 px-4 py-3 text-[13px]">
          <Truck size={18} style={{ color: "#17a34a" }} />
          <div className="flex-1">
            <span className="font-semibold" style={{ color: "#17a34a" }}>Frete grátis </span>
            <span className="line-through" style={{ color: THEME.faint }}>R$ {PRODUCT.shippingWas}</span>
            <Anno n={5} label="Redução de risco" note='"Frete grátis" e "Devolução gratuita" removem motivos para não comprar.' />
            <div style={{ color: THEME.muted }}>Receba até {PRODUCT.deliveryWindow}</div>
          </div>
          <ChevronRight size={18} style={{ color: THEME.faint }} />
        </div>

        <div style={{ height: 8, background: THEME.bg }} />

        {/* Opções → abre seletor */}
        <button onClick={() => openSheet("cart")} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <div className="flex gap-1">
            {VARIANTS.map((v) => (
              <span key={v.id} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: THEME.bg }}>
                <ProductArt color={v.art} size={28} />
              </span>
            ))}
          </div>
          <span className="flex-1 text-[14px]" style={{ color: THEME.ink }}>3 opções disponíveis</span>
          <ChevronRight size={18} style={{ color: THEME.faint }} />
        </button>

        <div style={{ height: 8, background: THEME.bg }} />

        {/* Atalhos para outras telas */}
        <div className="divide-y" style={{ borderColor: THEME.line }}>
          <Row label="Avaliações" sub={`${PRODUCT.rating} · ${PRODUCT.ratingCount} avaliações`} onClick={() => go("avaliacoes")} />
          <Row label="Descrição do produto" sub="Vídeo, especificações e detalhes" onClick={() => go("descricao")} />
          <Row label={`Visitar ${BRAND.store}`} sub={`${BRAND.followers} seguidores`} onClick={() => go("loja")} />
        </div>

        <div className="px-4 py-6 text-center text-[11px]" style={{ color: THEME.faint }}>
          Loja demonstrativa {BRAND.marketplace} · conteúdo fictício para estudo de layout
        </div>
      </div>

      {/* Barra de ação inferior — CTA sempre à mão */}
      <div className="relative flex items-stretch gap-1 border-t px-2 py-2" style={{ borderColor: THEME.line, background: THEME.surface }}>
        <span className="absolute -top-3 right-3"><Anno n={7} label="CTA sempre à mão" note="Barra inferior fixa mantém os botões de compra visíveis em qualquer rolagem." /></span>
        <IconBtn icon={Store} label="Loja" onClick={() => go("loja")} />
        <IconBtn icon={MessageCircle} label="Chat" onClick={() => go("chat")} />
        <button onClick={() => openSheet("cart")} className="flex flex-col items-center justify-center rounded-full px-4" style={{ background: "#ffe3d8", color: THEME.accentDeep }}>
          <ShoppingCart size={20} />
        </button>
        <button onClick={() => openSheet("buy")} className="flex flex-1 flex-col items-center justify-center rounded-full py-2 text-white" style={{ background: THEME.accent }}>
          <span className="text-[15px] font-bold">Compre</span>
          <span className="text-[10px] opacity-90">Promoção de R$ {PRODUCT.priceFrom}</span>
        </button>
      </div>
    </div>
  )
}

function Row({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <div className="flex-1">
        <div className="text-[14px] font-medium" style={{ color: THEME.ink }}>{label}</div>
        <div className="text-[12px]" style={{ color: THEME.muted }}>{sub}</div>
      </div>
      <ChevronRight size={18} style={{ color: THEME.faint }} />
    </button>
  )
}

function IconBtn({ icon: Ic, label, onClick }: { icon: typeof Store; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center px-3">
      <Ic size={20} style={{ color: THEME.ink }} />
      <span className="text-[10px]" style={{ color: THEME.muted }}>{label}</span>
    </button>
  )
}
