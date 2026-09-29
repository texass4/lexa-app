"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Inbox, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { Panel } from "@/components/ui/panel"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useDemoData } from "@/lib/store/demo-store"
import { useSession } from "@/lib/auth/session"
import { getUser } from "@/lib/account"
import { fmtNumericDate } from "@/lib/dates"
import { formatCNJ } from "@/lib/cnj"
import { formatOab } from "@/lib/intimacoes/oab"
import { TRIAGE_STATUS, isOpenTriage } from "@/lib/intimacoes/rows"
import { readableContent } from "@/lib/integrations/legal/djen/mapper"
import type { Intimacao } from "@/types"
import { useIntimacoes } from "./intimacoes-provider"
import { IntimacaoSheet } from "./intimacao-sheet"

type Filter = "abertas" | "sem_processo" | "revisao" | "decididas"

const FILTERS: Record<Filter, (i: Intimacao) => boolean> = {
  abertas: isOpenTriage,
  sem_processo: (i) => i.status === "sem_processo",
  revisao: (i) => i.status === "revisao",
  decididas: (i) => !isOpenTriage(i),
}

/**
 * Caixa de triagem das intimações capturadas do DJEN. Chegam sozinhas (captura diária
 * no servidor + tempo real); aqui o advogado vincula o processo, confere a sugestão e
 * confirma ou rejeita o prazo.
 */
export function IntimacoesView() {
  const data = useDemoData()
  const { user } = useSession()
  const { items, oabs, loading, unavailable } = useIntimacoes()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [filter, setFilter] = React.useState<Filter>("abertas")
  const [mine, setMine] = React.useState(user.role === "lawyer")

  // `?id=` abre a intimação (links da timeline do processo e das atividades).
  const selectedId = params.get("id")
  const selected = selectedId ? items.find((i) => i.id === selectedId) : undefined
  const select = (id?: string) => router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false })

  const scoped = items.filter((i) => !mine || i.responsibleId === user.id)
  const rows = scoped.filter(FILTERS[filter])
  const myOabs = oabs.filter((o) => o.userId === user.id && o.active)
  const noOab = user.role === "lawyer" && !loading && !unavailable && !myOabs.length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intimações"
        description="Comunicações do Diário de Justiça Eletrônico Nacional capturadas todo dia pelas OABs do escritório. Nenhum prazo é criado sem a confirmação do advogado."
      />

      {noOab && (
        <Panel className="flex items-start gap-3 border-warning/25 bg-warning-soft/40 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-[13px]">
            Você não tem inscrição na OAB cadastrada: as intimações não chegam para você.{" "}
            <Link href="/configuracoes?secao=perfil" className="font-medium underline">
              Cadastrar em Configurações › Perfil
            </Link>
          </p>
        </Panel>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          ariaLabel="Situação"
          layoutId="intimacoes-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "abertas", label: "A triar", count: scoped.filter(FILTERS.abertas).length },
            { value: "sem_processo", label: "Sem processo", count: scoped.filter(FILTERS.sem_processo).length },
            { value: "revisao", label: "Revisar", count: scoped.filter(FILTERS.revisao).length },
            { value: "decididas", label: "Decididas", count: scoped.filter(FILTERS.decididas).length },
          ]}
        />
        <button
          type="button"
          role="switch"
          aria-checked={mine}
          onClick={() => setMine((v) => !v)}
          className={cn(
            "h-8 self-start rounded-[9px] border px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
            mine ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          Somente minhas
        </button>
      </div>

      {unavailable ? (
        <Panel>
          <EmptyState
            icon={<Inbox />}
            title="Intimações indisponíveis."
            description="A caixa de triagem depende da atualização do banco (migração 0011). Fale com a administração da Íntegra."
          />
        </Panel>
      ) : loading ? (
        <SkeletonTable rows={6} />
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Inbox />}
            title={filter === "abertas" ? "Nada para triar." : "Nenhuma intimação nesta situação."}
            description="As intimações publicadas no DJEN para as OABs do escritório aparecem aqui automaticamente, todas as manhãs."
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((i) => {
              const process = data.processes.find((p) => p.id === i.processId)
              const client = data.clients.find((c) => c.id === (i.clientId ?? process?.clientId))
              const responsible = i.responsibleId ? getUser(i.responsibleId) : undefined
              const oab = oabs.find((o) => i.oabIds.includes(o.id))
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => select(i.id)}
                    className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/50 sm:px-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">
                        {process ? `Processo ${process.code}` : (i.processNumber ?? (i.cnj ? formatCNJ(i.cnj) : "Processo não informado"))}
                      </span>
                      {!process && (
                        <StatusBadge tone="violet" size="sm" dot={false}>
                          Não cadastrado
                        </StatusBadge>
                      )}
                      <StatusBadge tone={TRIAGE_STATUS[i.status].tone} size="sm">
                        {TRIAGE_STATUS[i.status].label}
                      </StatusBadge>
                      {i.suggestion?.fatalDate && isOpenTriage(i) && (
                        <span className="text-[12px] text-muted-foreground">prazo sugerido: {fmtNumericDate(i.suggestion.fatalDate)}</span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-[12.5px] text-muted-foreground">{readableContent(i.content)}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-subtle">
                      <span>Publicação {fmtNumericDate(i.publishedAt ?? i.availableAt)}</span>
                      <span>·</span>
                      <span>{[i.tribunal ? `DJEN · ${i.tribunal}` : "DJEN", i.tipoComunicacao].filter(Boolean).join(" · ")}</span>
                      {client && (
                        <>
                          <span>·</span>
                          <span>{client.name}</span>
                        </>
                      )}
                      {oab && (
                        <>
                          <span>·</span>
                          <span>{formatOab(oab)}</span>
                        </>
                      )}
                      {responsible && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <UserAvatar name={responsible.name} size="xs" /> {responsible.firstName}
                          </span>
                        </>
                      )}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <IntimacaoSheet intimacao={selected} onOpenChange={(open) => !open && select()} />
    </div>
  )
}
