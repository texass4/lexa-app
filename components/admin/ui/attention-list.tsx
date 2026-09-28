import Link from "next/link"
import { ArrowRight, CircleCheck } from "lucide-react"
import { cn } from "cn"
import type { AttentionItem } from "@/lib/admin/catalog"
import type { Tone } from "@/lib/config"

const TONE: Record<Tone, { dot: string; ring: string }> = {
  danger: { dot: "bg-danger", ring: "hover:border-danger/35" },
  warning: { dot: "bg-warning", ring: "hover:border-warning/35" },
  info: { dot: "bg-info", ring: "hover:border-info/35" },
  gold: { dot: "bg-gold", ring: "hover:border-gold/40" },
  neutral: { dot: "bg-subtle", ring: "hover:border-border-strong" },
  success: { dot: "bg-success", ring: "hover:border-success/35" },
  violet: { dot: "bg-violet", ring: "hover:border-violet/35" },
}

/** "O que pede ação agora": cada item é informação + contexto + link. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (!items.length) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-success/20 bg-success-soft/60 px-4 py-3.5">
        <CircleCheck className="size-5 shrink-0 text-success" />
        <div>
          <p className="text-[13.5px] font-medium text-foreground">Tudo em ordem</p>
          <p className="text-[12.5px] text-muted-foreground">Nenhum cadastro pendente, limite estourando ou cobrança atrasada.</p>
        </div>
      </div>
    )
  }
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.kind}>
          <Link
            href={item.href}
            className={cn(
              "group flex h-full items-start gap-3 rounded-[12px] border border-border bg-card px-4 py-3.5 shadow-card outline-none transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-float focus-visible:ring-2 focus-visible:ring-gold/45",
              TONE[item.tone].ring,
            )}
          >
            <span className="relative mt-1.5 flex size-2 shrink-0">
              {(item.tone === "danger" || item.tone === "warning") && (
                <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-50", TONE[item.tone].dot)} />
              )}
              <span className={cn("relative inline-flex size-2 rounded-full", TONE[item.tone].dot)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-foreground">{item.title}</span>
              <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{item.detail}</span>
            </span>
            <ArrowRight className="mt-1 size-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
