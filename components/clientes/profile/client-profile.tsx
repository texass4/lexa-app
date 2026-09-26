"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { UserX } from "lucide-react"
import { Panel } from "@/components/ui/panel"
import { buttonVariants } from "@/components/ui/button"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { UnderlineTabs } from "@/components/ui/underline-tabs"
import { Skeleton, SkeletonCard, SkeletonStats } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ClientHeader } from "./client-header"
import { OverviewTab } from "./overview-tab"
import { FinanceTab } from "./finance-tab"
import { AppointmentsTab, DocumentsTab, ProcessesTab, TasksTab, TimelineTab } from "./hub-tabs"
import { EditClientDialog } from "./edit-client-dialog"
import { useClientActions } from "@/components/clientes/client-actions"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { clientFinance, clientHub } from "@/lib/selectors"
import { getNow, toLocalISO } from "@/lib/dates"
import type { Permission } from "@/lib/auth/permissions"
import { useSession } from "@/lib/auth/session"

const TABS = ["visao-geral", "processos", "tarefas", "documentos", "compromissos", "financeiro", "timeline"] as const
export type ProfileTab = (typeof TABS)[number]

/** Permissão para ver cada aba — sem ela, a RLS nem entrega os dados. */
const TAB_PERMISSION: Partial<Record<ProfileTab, Permission>> = {
  processos: "processes.view",
  tarefas: "tasks.view",
  documentos: "documents.view",
  compromissos: "agenda.view",
  financeiro: "finance.view",
}

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
  const { updateClient, deleteClient, retryLoad } = useDemoActions()
  const { toggleActive, exportClient, deleteDescription } = useClientActions()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { can } = useSession()
  const ready = data.hydrated
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const allowed = (t: ProfileTab) => !TAB_PERMISSION[t] || can(TAB_PERMISSION[t]!)
  const tabParam = params.get("tab") as ProfileTab | null
  const tab: ProfileTab = tabParam && TABS.includes(tabParam) && allowed(tabParam) ? tabParam : "visao-geral"
  const setTab = (t: ProfileTab) => router.replace(t === "visao-geral" ? pathname : `${pathname}?tab=${t}`, { scroll: false })

  const client = data.clients.find((c) => c.id === id)
  // Recalcula só quando as coleções mudam, não a cada render.
  const hub = React.useMemo(() => clientHub(data, id), [data, id])
  const finance = React.useMemo(() => (can("finance.view") ? clientFinance(data, id) : undefined), [data, id, can])

  if (!ready && data.loadError) {
    return (
      <Panel className="mt-4">
        <ErrorState title="Não foi possível carregar o cliente." onRetry={retryLoad} />
      </Panel>
    )
  }

  // Até os dados salvos carregarem, "não encontrado" ainda não é conclusivo.
  if (!client && ready) {
    return (
      <Panel className="mt-4">
        <EmptyState
          icon={<UserX />}
          title="Cliente não encontrado."
          description="Este cadastro pode ter sido removido, o endereço está incorreto ou você não tem acesso a clientes."
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

  const pendingTasks = hub.tasks.filter((t) => t.status === "pendente").length
  const now = toLocalISO(getNow())
  const upcoming = hub.appointments.filter((a) => a.end > now).length
  const tabs = (
    [
      { value: "visao-geral", label: "Visão geral" },
      { value: "processos", label: "Processos", count: hub.processes.length },
      { value: "tarefas", label: "Tarefas", count: pendingTasks },
      { value: "documentos", label: "Documentos", count: hub.documents.length },
      { value: "compromissos", label: "Compromissos", count: upcoming },
      { value: "financeiro", label: "Financeiro" },
      { value: "timeline", label: "Timeline" },
    ] as { value: ProfileTab; label: string; count?: number }[]
  ).filter((t) => allowed(t.value))

  return (
    <div className="space-y-6">
      <ClientHeader
        client={client}
        delinquent={!!finance?.overdue}
        onEdit={() => setEditing(true)}
        onToggleActive={() => toggleActive(client)}
        onExport={() => exportClient(client)}
        onDelete={() => setDeleting(true)}
      />

      <UnderlineTabs ariaLabel="Seções do cliente" layoutId="client-tabs" value={tab} onChange={setTab} tabs={tabs} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === "visao-geral" && <OverviewTab client={client} hub={hub} finance={finance} onNavigate={setTab} />}
          {tab === "processos" && <ProcessesTab client={client} hub={hub} />}
          {tab === "tarefas" && <TasksTab client={client} hub={hub} />}
          {tab === "documentos" && <DocumentsTab client={client} hub={hub} />}
          {tab === "compromissos" && <AppointmentsTab client={client} hub={hub} />}
          {tab === "financeiro" && finance && <FinanceTab client={client} finance={finance} />}
          {tab === "timeline" && <TimelineTab hub={hub} />}
        </motion.div>
      </AnimatePresence>

      <EditClientDialog client={client} open={editing} onOpenChange={setEditing} onSave={(patch) => updateClient(client.id, patch)} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir ${client.name}?`}
        description={deleteDescription(client)}
        onConfirm={() => {
          deleteClient(client.id)
          toast.success("Cliente excluído.", { description: client.name })
          router.push("/clientes")
        }}
      />
    </div>
  )
}
