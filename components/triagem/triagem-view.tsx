"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CheckCheck, Hourglass, Inbox, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { Panel } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useOfficeData } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/auth/account"
import { fmtNumericDate, getNow, toLocalISO } from "@/lib/core/dates"
import { formatCNJ } from "@/lib/processos/cnj"
import {
  KIND_LABEL,
  SOURCE_LABEL,
  byPriority,
  daysLeft,
  isOpen,
  requiresAction,
  stateBadge,
  suggestedDeadline,
  summaryOf,
  tabOf,
  urgencyOf,
  type TriageTab,
  type Urgency,
} from "@/lib/triagem/model"
import type { TriageItem } from "@/types"
import { useTriagem } from "./triagem-provider"
import { ACTION_TEXT, TriageSheet } from "./triage-sheet"
import { ConfirmPrazoDialog } from "./confirm-prazo-dialog"

const TABS: { value: TriageTab; label: string }[] = [
  { value: "a_revisar", label: "A revisar" },
  { value: "sem_processo", label: "Sem processo" },
  { value: "revisar", label: "Revisar" },
  { value: "decididos", label: "Decididos" },
]

const URGENCY_DOT: Record<Urgency, string> = { alta: "bg-danger", media: "bg-warning", baixa: "bg-border" }
const URGENCY_LABEL: Record<Urgency, string> = { alta: "Urgente", media: "Atenção", baixa: "Sem urgência" }

/** Por que este item está na fila — só com o que o modelo já sabe. */
function whyItMatters(item: TriageItem, today: string) {
  if (item.reviewReason) return item.reviewReason
  const left = daysLeft(item, today)
  const action = requiresAction(item)
  if (left !== undefined && left <= 5) {
    if (left < 0) return "Prazo sugerido já passou"
    if (left === 0) return "Possível prazo para hoje"
    return left === 1 ? "Possível prazo amanhã" : `Possível prazo em ${left} dias`
  }
  if (action?.value === "sim") return "Pode exigir uma providência"
  if (action?.value === "incerto") return "Ainda não ficou claro se exige providência"
  if (!item.processId && isOpen(item)) return "Ainda sem processo vinculado no escritório"
  if (item.kind === "movimentacao" && isOpen(item)) return "Movimentação que pode pedir leitura"
  return undefined
}

/** No máximo dois sinais, do mais decisivo ao contexto. */
function queueCues(item: TriageItem, today: string) {
  if (!isOpen(item)) return []
  const cues: string[] = []
  if (urgencyOf(item, today) === "alta") cues.push("Alta prioridade")
  if (suggestedDeadline(item)) cues.push("Possível prazo")
  else if (item.kind === "movimentacao") cues.push("Movimentação relevante")
  if (requiresAction(item)?.value === "sim") cues.push("Próximo passo sugerido")
  return cues.slice(0, 2)
}

/**
 * Triagem jurídica: uma caixa única com os eventos que podem exigir ação — intimações
 * do DJEN, movimentações relevantes do DataJud e o que vier de outras fontes. Chegam
 * sozinhos (agendador no servidor + tempo real); aqui o advogado entende, decide e age.
 */
export function TriagemView() {
  const data = useOfficeData()
  const { user, can } = useSession()
  const { items, oabs, loading, unavailable } = useTriagem()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [tab, setTab] = React.useState<TriageTab>("a_revisar")
  const [mine, setMine] = React.useState(user.role === "lawyer")
  const [confirming, setConfirming] = React.useState<TriageItem>()
  const today = toLocalISO(getNow()).slice(0, 10)

  // `?id=` abre o evento (links da timeline do processo e das atividades).
  const selectedId = params.get("id")
  const selected = selectedId ? items.find((i) => i.id === selectedId) : undefined
  const select = (id?: string) => router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false })

  const scoped = items.filter((i) => !mine || i.responsibleId === user.id)
  const rows = scoped.filter((i) => tabOf(i) === tab).sort(byPriority(today))
  const openItems = scoped.filter(isOpen)
  const attention = openItems.length
  const high = openItems.filter((i) => urgencyOf(i, today) === "alta").length
  const withDeadline = openItems.filter((i) => suggestedDeadline(i)).length
  const queueReading = [
    attention === 1 ? "1 na fila" : `${attention} na fila`,
    high ? (high === 1 ? "1 em alta prioridade" : `${high} em alta prioridade`) : undefined,
    withDeadline ? (withDeadline === 1 ? "1 com possível prazo" : `${withDeadline} com possível prazo`) : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
  const myOabs = oabs.filter((o) => o.userId === user.id && o.active)
  const noOab = user.role === "lawyer" && !loading && !unavailable && !myOabs.length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triagem"
        description="Fila do que pode pedir providência. Cada item mostra por que entrou e o que fazer em seguida. Nenhum prazo é criado sem a sua confirmação."
      />

      {noOab && (
        <Panel className="flex items-start gap-3 border-warning/25 bg-warning-soft/40 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-[13px]">
            Você não tem inscrição na OAB cadastrada: as intimações do DJEN não chegam para você.{" "}
            <Link href="/configuracoes?secao=perfil" className="font-medium underline">
              Cadastrar em Configurações › Perfil
            </Link>
          </p>
        </Panel>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          ariaLabel="Situação"
          layoutId="triagem-filter"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ ...t, count: scoped.filter((i) => tabOf(i) === t.value).length }))}
        />
        <button
          type="button"
          role="switch"
          aria-checked={mine}
          onClick={() => setMine((v) => !v)}
          className={cn(
            "h-8 self-start rounded-control border px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
            mine ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          Somente minhas
        </button>
      </div>

      {!loading && !unavailable && attention > 0 && (
        <p className="text-[13.5px] text-foreground">
          <span className="font-medium">{queueReading}</span>
          <span className="text-muted-foreground">{mine ? " · na sua fila" : " · no escritório"}</span>
        </p>
      )}

      {unavailable ? (
        <Panel>
          <EmptyState
            icon={<Inbox />}
            title="Triagem indisponível."
            description="A Triagem ainda não foi ativada para o escritório. Fale com o suporte da Íntegra."
          />
        </Panel>
      ) : loading ? (
        <SkeletonTable rows={6} />
      ) : rows.length === 0 ? (
        <Panel>
          {tab !== "decididos" && attention === 0 ? (
            <EmptyState icon={<CheckCheck />} title="Tudo em dia" description="Nenhum evento exige sua atenção no momento." />
          ) : (
            <EmptyState
              icon={<Inbox />}
              title="Nenhum evento nesta situação."
              description="Intimações do DJEN e movimentações relevantes aparecem aqui automaticamente."
            />
          )}
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((i) => (
              <TriageRow
                key={i.id}
                item={i}
                today={today}
                processLabel={processLabel(i, data.processes.find((p) => p.id === i.processId)?.code)}
                clientName={data.clients.find((c) => c.id === (i.clientId ?? data.processes.find((p) => p.id === i.processId)?.clientId))?.name}
                canConfirm={can("processes.edit")}
                onOpen={() => select(i.id)}
                onConfirm={() => setConfirming(i)}
              />
            ))}
          </ul>
        </Panel>
      )}

      <TriageSheet item={selected} onOpenChange={(open) => !open && select()} />
      <ConfirmPrazoDialog item={confirming} onOpenChange={(open) => !open && setConfirming(undefined)} />
    </div>
  )
}

function processLabel(i: TriageItem, code?: string) {
  if (code) return `Processo ${code}`
  return i.processNumber ?? (i.cnj ? formatCNJ(i.cnj) : "Processo não informado")
}

/** Um evento na lista: urgência e tipo → processo e cliente → resumo → exige ação e prazo → ações. */
function TriageRow({
  item: i,
  today,
  processLabel,
  clientName,
  canConfirm,
  onOpen,
  onConfirm,
}: {
  item: TriageItem
  today: string
  processLabel: string
  clientName?: string
  canConfirm: boolean
  onOpen: () => void
  onConfirm: () => void
}) {
  const open = isOpen(i)
  const urgency = urgencyOf(i, today)
  const action = requiresAction(i)
  const suggested = suggestedDeadline(i)
  const responsible = i.responsibleId ? getUser(i.responsibleId) : undefined
  const badge = stateBadge(i)
  const cues = queueCues(i, today)
  const why = open ? whyItMatters(i, today) : undefined

  return (
    <li className="group flex flex-col gap-2 px-4 py-3.5 transition-colors duration-200 hover:bg-accent/45 sm:px-5">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-1.5 rounded-[8px] text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <div className="flex flex-wrap items-center gap-2">
          {open && (
            <span
              className={cn("size-2 shrink-0 rounded-full", URGENCY_DOT[urgency])}
              aria-label={URGENCY_LABEL[urgency]}
              title={URGENCY_LABEL[urgency]}
            />
          )}
          <span className="text-[13px] font-semibold">{KIND_LABEL[i.kind]}</span>
          <span className="text-[12px] text-subtle">{[SOURCE_LABEL[i.source], i.tribunal].filter(Boolean).join(" · ")}</span>
          <StatusBadge tone={badge.tone} size="sm">
            {badge.label}
          </StatusBadge>
          {!i.processId && open && (
            <StatusBadge tone="violet" size="sm" dot={false}>
              Não cadastrado
            </StatusBadge>
          )}
          {cues.map((cue) => (
            <span key={cue} className="text-[11px] font-medium tracking-[0.01em] text-muted-foreground">
              {cue}
            </span>
          ))}
        </div>
        <p className="text-[13.5px] font-medium">
          {processLabel}
          {clientName && <span className="font-normal text-muted-foreground"> · {clientName}</span>}
        </p>
        <p className="line-clamp-2 text-[12.5px] text-muted-foreground">{summaryOf(i)}</p>
        {why && <p className="text-[12.5px] text-foreground/80">{why}</p>}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-subtle">
          <span>
            {i.kind === "intimacao" ? "Publicada em" : "Em"} {fmtNumericDate(i.eventDate)}
          </span>
          {responsible && (
            <>
              <span>·</span>
              <span>{responsible.firstName}</span>
            </>
          )}
          {open && action && (
            <>
              <span>·</span>
              <span className={cn(action.value === "sim" && "font-medium text-foreground")}>Exige ação: {ACTION_TEXT[action.value]}</span>
            </>
          )}
          {open && suggested && (
            <>
              <span>·</span>
              <span className={cn("font-medium", urgency === "alta" ? "text-danger" : "text-foreground")}>
                Prazo sugerido: {fmtNumericDate(suggested.fatalDate)}
              </span>
            </>
          )}
        </p>
      </button>
      {open && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onOpen}>
            Revisar
          </Button>
          {canConfirm && i.processId && (
            <Button size="sm" onClick={onConfirm}>
              <Hourglass /> Confirmar prazo
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
