import type { Metadata } from "next"
import { Storefront } from "@/components/loja-demo/storefront"

export const metadata: Metadata = {
  title: "Loja (demo)",
  description: "Demo de loja mobile para estudo de layout e gatilhos de conversão. Conteúdo fictício.",
}

export default function LojaDemoPage() {
  return <Storefront />
}
