// Dados DEMONSTRATIVOS de uma loja mobile fictícia ("Aurora" / "Sorriso Store").
// Nada aqui representa uma marca real nem integra pagamento/servidor — é material de
// estudo de layout e de gatilhos de conversão. Os números são ilustrativos.

export type Variant = {
  id: string
  label: string
  /** cor usada na ilustração SVG do produto */
  art: string
  stock: number
}

export const BRAND = {
  marketplace: "Aurora", // marketplace fictício (NÃO é o TikTok)
  store: "Sorriso Store",
  storeRating: "4,5/5,0",
  storeRatingLabel: "Ótima avaliação!",
  followers: "48,2 mil",
  sold: "121,0 mil",
}

export const PRODUCT = {
  name: "Escova Dental Elétrica USB Carga 6 Engrenagem À Prova D'água",
  rating: "4.6",
  ratingCount: "17,8 mil",
  sold: "121,0 mil",
  priceFrom: "18,61", // preço promocional "a partir de"
  price: 18.61,
  original: 70.0,
  originalLabel: "70,00",
  discountPct: 73,
  savingsLabel: "51,39",
  shippingWas: "4,55",
  deliveryWindow: "sáb., 24 de out – ter., 27 de out",
  features: ["limpeza profunda", "sem fio", "USB", "portátil", "viagem"],
}

export const VARIANTS: Variant[] = [
  { id: "preto", label: "preto", art: "#2b2b2f", stock: 32 },
  { id: "branco", label: "branco", art: "#f3f4f6", stock: 11 },
  { id: "rosa", label: "rosa", art: "#f6c8d4", stock: 0 },
]

export type Review = {
  author: string
  stars: number
  variant: string
  text: string
  photos: number
}

export const REVIEWS: Review[] = [
  {
    author: "Camila R.",
    stars: 5,
    variant: "branco",
    text: "Chegou antes do prazo, limpa muito bem. A bateria dura bastante no modo USB.",
    photos: 2,
  },
  {
    author: "João P.",
    stars: 5,
    variant: "preto",
    text: "Custo-benefício absurdo pelo preço da promoção. Recomendo o modo suave.",
    photos: 1,
  },
  {
    author: "Marina S.",
    stars: 4,
    variant: "rosa",
    text: "Bonita e eficiente. Tirei uma estrela só porque veio com poucas cerdas extras.",
    photos: 0,
  },
  {
    author: "Diego A.",
    stars: 5,
    variant: "branco",
    text: "Veio bem embalada e a devolução gratuita me deu segurança pra comprar.",
    photos: 3,
  },
]

export const SUGGESTED_QUESTIONS = [
  "Qual o prazo de entrega?",
  "Tem garantia?",
  "Como funciona a devolução gratuita?",
  "Vem com cerdas extras?",
]

// Catálogo da vitrine (grade da página da loja) — produtos fictícios.
export const CATALOG = [
  { id: "p1", name: "Escova Dental Elétrica USB 6 Engrenagens", price: "18,61", original: "70,00", off: 73, sold: "121,0 mil", rating: "4.6", art: "#2b2b2f" },
  { id: "p2", name: "Kit 8 Refis de Cerdas Macias", price: "9,90", original: "29,90", off: 66, sold: "54,3 mil", rating: "4.7", art: "#60a5fa" },
  { id: "p3", name: "Irrigador Oral Portátil Recarregável", price: "39,90", original: "120,00", off: 66, sold: "22,1 mil", rating: "4.5", art: "#34d399" },
  { id: "p4", name: "Estojo de Viagem Antibacteriano", price: "14,50", original: "39,90", off: 63, sold: "8,9 mil", rating: "4.4", art: "#f6c8d4" },
  { id: "p5", name: "Creme Dental Branqueador 100g", price: "7,99", original: "19,90", off: 59, sold: "67,0 mil", rating: "4.8", art: "#fbbf24" },
  { id: "p6", name: "Fio Dental com Haste 60un", price: "6,49", original: "15,00", off: 56, sold: "41,2 mil", rating: "4.6", art: "#a78bfa" },
]

// Gatilhos de conversão rotulados — usados pela legenda e pelos marcadores de anotação.
export type Trigger = { id: number; name: string; note: string }

export const TRIGGERS: Trigger[] = [
  { id: 1, name: "Ancoragem de preço", note: "Preço cheio riscado (R$ 70,00) ao lado do promocional faz o R$ 18,61 parecer uma pechincha." },
  { id: 2, name: "Desconto em destaque", note: 'Selo "-73%" transforma o desconto em número grande e chamativo.' },
  { id: 3, name: "Prova social", note: '"121 mil vendidos" e "4.6 (17,8 mil)" mostram que muita gente já comprou e aprovou.' },
  { id: 4, name: "Urgência / escassez", note: '"A oferta termina em breve" e o selo "Oferta" pressionam a decisão imediata.' },
  { id: 5, name: "Redução de risco", note: '"Frete grátis" e "Devolução gratuita" tiram os motivos pra não comprar.' },
  { id: 6, name: "Enquadramento de ganho", note: '"Você está economizando R$ 51,39" reforça o que a pessoa ganha, não o que gasta.' },
  { id: 7, name: "CTA sempre à mão", note: "Barra inferior fixa mantém o botão de compra visível em qualquer rolagem." },
  { id: 8, name: "Default pré-marcado", note: '"Definir como padrão" já vem ligado — o caminho de menor esforço favorece a conversão.' },
  { id: 9, name: "Facilitação de pagamento", note: "Pix, Apple Pay e cartão reduzem o atrito na hora de pagar." },
]
