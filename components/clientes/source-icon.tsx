import { AtSign, Globe, Handshake, MessageCircle, Search } from "lucide-react"
import type { ClientSource } from "@/types"

const ICONS: Record<ClientSource, React.ElementType> = {
  WhatsApp: MessageCircle,
  Instagram: AtSign,
  Indicação: Handshake,
  Site: Globe,
  Google: Search,
}

export function SourceIcon({ source, className }: { source: ClientSource; className?: string }) {
  const Icon = ICONS[source]
  return <Icon className={className} aria-hidden />
}
