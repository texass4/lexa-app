import Link from "next/link"
import { ArrowRight } from "lucide-react"

/** "Ver todos →" no canto dos cartões do Painel. */
export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group touch-target relative flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
