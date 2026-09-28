"use client"

import * as React from "react"
import { CircleAlert, CircleCheck, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/motion"
import { fmtNumericDate } from "@/lib/dates"
import { degreeLabel } from "@/lib/services/processes/labels"
import type { ProcessSheet } from "@/lib/services/processes/sheet"
import type { Process } from "@/types"

/** Campos que a consulta preenche — mesmos rótulos no esqueleto e no resultado. */
const FIELDS = ["Tribunal", "Grau", "Classe", "Órgão julgador", "Ajuizamento", "Movimentações"] as const

/** O que o resultado mostra, venha de uma consulta ou de um processo já salvo. */
export type LookupSummary = Record<(typeof FIELDS)[number], string | undefined>

export const summaryFromSheet = (sheet: ProcessSheet): LookupSummary => ({
  Tribunal: sheet.tribunal,
  Grau: degreeLabel(sheet.degree),
  Classe: sheet.className ?? sheet.subject,
  "Órgão julgador": sheet.judicialUnit,
  Ajuizamento: sheet.filedAt ? fmtNumericDate(sheet.filedAt) : undefined,
  Movimentações: String(sheet.movements.length),
})

export const summaryFromProcess = (process: Process): LookupSummary => ({
  Tribunal: process.tribunal,
  Grau: degreeLabel(process.degree),
  Classe: process.className ?? process.subject ?? process.type,
  "Órgão julgador": process.judicialUnit ?? process.court,
  Ajuizamento: fmtNumericDate(process.distributedAt),
  Movimentações: String(process.movements.length),
})

/** Segundos desde `since`, atualizado a cada segundo enquanto houver `since`. */
function useElapsed(since: number | null) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (since === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [since])
  return since === null ? 0 : Math.max(0, (now - since) / 1000)
}

/** Mensagem conforme a espera cresce — sem expor o que acontece por trás. */
function progressMessage(seconds: number) {
  if (seconds < 3) return "Buscando processo…"
  if (seconds < 10) return "Consultando informações do processo…"
  if (seconds < 25) return "Buscando informações atualizadas…"
  return "Isso pode levar alguns instantes. Você pode continuar preenchendo os campos."
}

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-[12px] border px-3.5 py-3 ${className}`}>{children}</div>
)

function FactGrid({ children }: { children: React.ReactNode }) {
  return <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">{children}</dl>
}

export function LookupProgress({ startedAt }: { startedAt: number }) {
  const message = progressMessage(useElapsed(startedAt))
  return (
    <Card className="border-border bg-surface">
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold/50" />
          <span className="relative inline-flex size-2 rounded-full bg-gold" />
        </span>
        <span key={message} className="animate-in fade-in duration-300">
          {message}
        </span>
      </p>
      <FactGrid>
        {FIELDS.map((label) => (
          <div key={label} className="min-w-0" aria-hidden>
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="mt-1">
              <Skeleton className="h-3.5 w-4/5" />
            </dd>
          </div>
        ))}
      </FactGrid>
    </Card>
  )
}

export function LookupFound({ summary: facts, existed }: { summary: LookupSummary; existed: boolean }) {
  return (
    <Card className="border-success/25 bg-success-soft/40">
      <p className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
        <CircleCheck className="size-4 shrink-0 text-success" />
        {existed ? "Processo encontrado — já está em Processos, com as informações em dia." : "Processo encontrado e salvo em Processos."}
      </p>
      <FactGrid>
        {FIELDS.map((label, i) => (
          <FadeIn key={label} delay={i * 0.05} y={4} className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 truncate text-[12.5px] font-medium text-foreground" title={facts[label]}>
              {facts[label] ?? <span className="font-normal text-subtle">Não informado</span>}
            </dd>
          </FadeIn>
        ))}
      </FactGrid>
      <p className="mt-3 text-[12px] text-muted-foreground">Ajuste cliente e responsável e clique em salvar.</p>
    </Card>
  )
}

export function LookupFailed({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <Card className="flex items-start gap-2.5 border-danger/25 bg-danger-soft/50">
      <CircleAlert className="mt-px size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{message} Se preferir, preencha os campos manualmente.</p>
      </div>
      {onRetry && (
        <Button type="button" variant="ghost" size="sm" className="-my-1 shrink-0" onClick={onRetry}>
          <RotateCw /> Tentar novamente
        </Button>
      )}
    </Card>
  )
}
