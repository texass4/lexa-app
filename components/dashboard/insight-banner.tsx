"use client"

import { ArrowRight, ChevronDown, Sparkles } from "lucide-react"
import { cn } from "cn"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"
import { useOfficeData } from "@/lib/store/office-store"
import { officeDigest } from "@/lib/dashboard/dashboard"
import { BRAND } from "@/lib/core/brand"
import { useSession } from "@/lib/auth/session"

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Faixa de resumo do topo do Painel. Os números são contagens dos dados reais (não
 * uma análise da IA); "Ver insights" abre a lista do que merece atenção, e o cartão
 * da direita abre a conversa com a Íntegra IA.
 */
export function InsightBanner({ expanded, onToggle, critical }: { expanded: boolean; onToggle: () => void; critical: number }) {
  const data = useOfficeData()
  const lexa = useLexaAI()
  const { can } = useSession()
  const digest = officeDigest(data)
  const found = [
    plural(digest.recentMovements, "movimentação nos últimos 7 dias", "movimentações nos últimos 7 dias"),
    plural(digest.upcomingPrazos, "prazo próximo", "prazos próximos"),
    // Parcelas em atraso só para quem tem o Financeiro.
    can("finance.view") && plural(digest.overdueInvoices, "parcela em atraso", "parcelas em atraso"),
  ].filter((item): item is string => !!item)
  const aiState = lexa.ready ? "Pronta para ajudar" : lexa.status ? (lexa.status.enabled ? "Ainda não configurada" : "Desligada") : "Verificando…"

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
              Encontrou {found.slice(0, -1).join(", ")} e {found.at(-1)}
              {critical > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-danger">{plural(critical, "ponto urgente", "pontos urgentes")}</span>
                </>
              )}
              .
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="painel-atencao"
          className="group inline-flex shrink-0 items-center gap-1.5 self-start rounded-control px-2 py-1.5 text-[13px] font-medium text-brand outline-none transition-colors hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand/40 lg:self-center"
        >
          {expanded ? "Ocultar insights" : "Ver insights"}
          {expanded ? (
            <ChevronDown className="size-4 rotate-180 transition-transform" />
          ) : (
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => lexa.open()}
          className="flex shrink-0 items-center gap-3 rounded-[14px] border border-white/60 bg-surface/85 p-3 pr-4 text-left shadow-card outline-none backdrop-blur-sm transition-[box-shadow] hover:shadow-raised focus-visible:ring-2 focus-visible:ring-brand/40 dark:border-border/60 lg:w-[240px]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="size-[18px]" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-snug text-foreground">Sua assistente jurídica</span>
            <span className="block truncate text-[12px] text-muted-foreground">{aiState}</span>
          </span>
          <span aria-hidden className={cn("size-2 shrink-0 self-start rounded-full", lexa.ready ? "bg-success" : "bg-subtle")} />
        </button>
      </div>
    </section>
  )
}
