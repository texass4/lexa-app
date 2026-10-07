"use client"

import { ArrowRight, ChevronDown, Sparkles } from "lucide-react"
import { useOfficeData } from "@/lib/store/office-store"
import { officeDigest } from "@/lib/dashboard/dashboard"
import { BRAND } from "@/lib/core/brand"
import { useSession } from "@/lib/auth/session"

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Faixa de resumo do topo do Painel. Os números são contagens dos dados reais (não
 * uma análise da IA); o botão mostra/oculta a lista do que merece atenção (que já
 * diz quantos pontos são urgentes). A Íntegra IA fica no "Perguntar" do topo.
 */
export function InsightBanner({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const data = useOfficeData()
  const { can } = useSession()
  const digest = officeDigest(data)
  const found = [
    plural(digest.recentMovements, "movimentação nos últimos 7 dias", "movimentações nos últimos 7 dias"),
    plural(digest.upcomingPrazos, "prazo próximo", "prazos próximos"),
    // Parcelas em atraso só para quem tem o Financeiro.
    can("finance.view") && plural(digest.overdueInvoices, "parcela em atraso", "parcelas em atraso"),
  ].filter((item): item is string => !!item)

  return (
    <section aria-label="Resumo do escritório" className="insight-banner relative overflow-hidden rounded-card border border-border/90 shadow-card">
      <div className="relative flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6 lg:pr-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-brand shadow-[0_4px_14px_-4px_rgb(43_87_196/0.35)] ring-1 ring-brand/10">
            <Sparkles className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              A {BRAND.name} acompanha {plural(digest.activeProcesses, "processo ativo", "processos ativos")}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Encontrou {found.slice(0, -1).join(", ")} e {found.at(-1)}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="painel-atencao"
          className="group touch-target relative inline-flex shrink-0 items-center gap-1.5 self-start rounded-control px-2 py-1.5 text-[13px] font-medium text-brand outline-none transition-colors hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand/40 lg:self-center"
        >
          {expanded ? "Ocultar lista" : "Ver o que merece atenção"}
          {expanded ? (
            <ChevronDown className="size-4 rotate-180 transition-transform" />
          ) : (
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </div>
    </section>
  )
}
