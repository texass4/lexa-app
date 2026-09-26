"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { CalendarClock, FilePlus, Plus, Scale, UserX } from "lucide-react"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button, buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { UnderlineTabs } from "@/components/ui/underline-tabs"
import { Skeleton, SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProcessListItem } from "@/components/shared/process-list-item"
import { DocumentList } from "@/components/shared/document-list"
import { ActivityTimeline } from "@/components/shared/activity-timeline"
import { ClientHeader } from "./client-header"
import { OverviewTab } from "./overview-tab"
import { FinanceTab } from "./finance-tab"
import { EditClientDialog } from "./edit-client-dialog"
import { ClientAIPanel } from "@/components/ai/client-ai-panel"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { useUI } from "@/lib/store/ui-store"
import { Can, useSession } from "@/lib/auth/session"

const TABS = ["visao-geral", "processos", "documentos", "financeiro", "timeline"] as const
type Tab = (typeof TABS)[number]

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando cliente">
      <div className="rounded-[18px] border border-border bg-card p-7">
        <div className="flex items-center gap-5">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2.5">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-3.5 w-64" />
          </div>
        </div>
      </div>
      <Skeleton className="h-9 w-full max-w-lg" />
      <SkeletonStats />
      <div className="grid gap-5 lg:grid-cols-12">
        <SkeletonCard className="lg:col-span-5" lines={4} />
        <SkeletonCard className="lg:col-span-7" lines={4} />
      </div>
    </div>
  )
}

export function ClientProfile({ id }: { id: string }) {
  const data = useDemoData()
  const { updateClient, deleteClient } = useDemoActions()
  const { openDialog } = useUI()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const ready = data.hydrated
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const { can } = useSession()
  const showFinance = can("finance.view")
  const tabParam = params.get("tab") as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) && (tabParam !== "financeiro" || showFinance) ? tabParam : "visao-geral"
  const setTab = (t: Tab) => router.replace(t === "visao-geral" ? pathname : `${pathname}?tab=${t}`, { scroll: false })

  const client = data.clients.find((c) => c.id === id)

  // Até os dados salvos carregarem, "não encontrado" ainda não é conclusivo.
  if (!client && ready) {
    return (
      <Panel className="mt-4">
        <EmptyState
          icon={<UserX />}
          title="Cliente não encontrado."
          description="Este cadastro pode ter sido removido ou o endereço está incorreto."
          action={
            <Link href="/clientes" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Voltar para clientes
            </Link>
          }
        />
      </Panel>
    )
  }

  if (!client) return <ProfileSkeleton />

  const processes = data.processes
    .filter((p) => p.clientId === id)
    .sort(
      (a, b) =>
        (a.status === "concluido" ? 1 : 0) - (b.status === "concluido" ? 1 : 0) ||
        (a.nextDeadline?.date ?? "9").localeCompare(b.nextDeadline?.date ?? "9"),
    )
  const documents = data.documents.filter((d) => d.clientId === id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
  const activities = data.activities.filter((a) => a.clientId === id)

  return (
    <div className="space-y-6">
      <ClientHeader client={client} onEdit={() => setEditing(true)} onDelete={() => setDeleting(true)} />
      <ClientAIPanel key={client.id} client={client} />

      <UnderlineTabs
        ariaLabel="Seções do cliente"
        layoutId="client-tabs"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "visao-geral", label: "Visão geral" },
          { value: "processos", label: "Processos", count: processes.length },
          { value: "documentos", label: "Documentos", count: documents.length },
          ...(showFinance ? [{ value: "financeiro" as const, label: "Financeiro" }] : []),
          { value: "timeline", label: "Timeline" },
        ]}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === "visao-geral" && <OverviewTab client={client} activities={activities} onSeeTimeline={() => setTab("timeline")} />}

          {tab === "processos" &&
            (processes.length ? (
              <div className="space-y-3">
                {processes.map((p) => (
                  <ProcessListItem key={p.id} process={p} />
                ))}
              </div>
            ) : (
              <Panel>
                <EmptyState
                  icon={<Scale />}
                  title="Nenhum processo encontrado."
                  description="Este cliente ainda não possui processos cadastrados no escritório."
                  action={
                    <Can permission="processes.edit">
                      <Button size="sm" onClick={() => openDialog("process", { clientId: client.id })}>
                        <Plus /> Novo processo
                      </Button>
                    </Can>
                  }
                />
              </Panel>
            ))}

          {tab === "documentos" && (
            <Panel>
              <PanelHeader
                title="Documentos"
                description={`${documents.length} arquivos · ${client.name}`}
                action={
                  <Can permission="documents.edit">
                    <Button size="sm" onClick={() => openDialog("document", { clientId: client.id })}>
                      <FilePlus /> Adicionar documento
                    </Button>
                  </Can>
                }
              />
              {documents.length ? (
                <div className="border-t border-border">
                  <DocumentList documents={documents} />
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={<FilePlus />}
                  title="Nenhum documento ainda."
                  description="Adicione RG, procuração, contrato e demais arquivos do cliente."
                />
              )}
            </Panel>
          )}

          {tab === "financeiro" && <FinanceTab client={client} />}

          {tab === "timeline" && (
            <Panel className="p-5 sm:p-7">
              {activities.length ? (
                <ActivityTimeline activities={activities} />
              ) : (
                <EmptyState compact icon={<CalendarClock />} title="Sem movimentações ainda." />
              )}
            </Panel>
          )}
        </motion.div>
      </AnimatePresence>

      <EditClientDialog client={client} open={editing} onOpenChange={setEditing} onSave={(patch) => updateClient(client.id, patch)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir ${client.name}?`}
        description="Esta ação não pode ser desfeita. Processos, documentos e tarefas vinculados a este cliente deixam de mostrar o nome dele."
        onConfirm={() => {
          deleteClient(client.id)
          toast.success("Cliente excluído.", { description: client.name })
          router.push("/clientes")
        }}
      />
    </div>
  )
}
