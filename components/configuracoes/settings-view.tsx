"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Building, Plug, ShieldCheck, UserRound, UsersRound, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Panel } from "@/components/ui/panel"
import { buttonVariants } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { ProfileSection } from "./profile-section"
import { OfficeSection } from "./office-section"
import { MembersManager } from "./members-manager"
import { PermissionsSection } from "./permissions-section"
import { AIPrivacyCard } from "@/components/ai/ai-privacy"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"
import type { Tone } from "@/lib/config"
import { whatsappApi, type InstanceInfo } from "@/lib/whatsapp/client"
import { connectionHealth, connectionProblem, type ConnectionHealth } from "@/lib/whatsapp/connection"
import { formatPhone } from "@/lib/whatsapp/phone"

// Notificações ficam fora até existirem de verdade (envio, canais e preferências salvas).
const SECTIONS = [
  { id: "perfil", label: "Perfil", icon: UserRound, description: "Seus dados e preferências" },
  { id: "escritorio", label: "Escritório", icon: Building, description: "Dados do escritório e plano" },
  { id: "usuarios", label: "Usuários", icon: UsersRound, description: "Equipe com acesso à Íntegra", permission: "users.manage" },
  { id: "permissoes", label: "Permissões", icon: ShieldCheck, description: "O que cada perfil pode fazer", permission: "users.manage" },
  { id: "integracoes", label: "Integrações", icon: Plug, description: "Conexões com outros serviços" },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon; description: string; permission?: Permission }[]

type SectionId = (typeof SECTIONS)[number]["id"]

/** Integrações planejadas e ainda não implementadas: aparecem só como "Em breve", sem ação. */
const UPCOMING: { name: string; description: string; mark: string }[] = [
  { name: "Google Agenda", description: "Sincronizar consultas, audiências e prazos.", mark: "GA" },
  { name: "Assinatura eletrônica", description: "Enviar contratos e procurações para assinatura.", mark: "AE" },
  { name: "Outlook e Gmail", description: "Vincular e-mails a clientes e processos.", mark: "@" },
  { name: "Emissão de boletos e Pix", description: "Cobrar honorários com baixa automática.", mark: "R$" },
]

function IntegrationCard({
  mark,
  name,
  badge,
  description,
  children,
}: {
  mark: string
  name: string
  badge: React.ReactNode
  description: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Panel className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-muted/60 text-[12px] font-semibold text-foreground">
          {mark}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold">{name}</p>
            {badge}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{description}</p>
        </div>
      </div>
      {children && <div className="mt-4 flex justify-end">{children}</div>}
    </Panel>
  )
}

const WHATSAPP_BADGE: Record<ConnectionHealth, { tone: Tone; label: string }> = {
  loading: { tone: "neutral", label: "Verificando…" },
  connected: { tone: "success", label: "Conectado" },
  disconnected: { tone: "warning", label: "Desconectado" },
  unconfigured: { tone: "neutral", label: "Não configurado" },
  error: { tone: "danger", label: "Indisponível" },
}

/**
 * Estado real do WhatsApp do escritório: a mesma consulta (`GET /api/whatsapp/instance`)
 * e a mesma leitura (`connectionHealth`) da Central de Atendimento. A conexão em si é
 * feita e diagnosticada na Central.
 */
function WhatsAppCard() {
  const { can } = useSession()
  const allowed = can("whatsapp.view")
  const [state, setState] = React.useState<{ info: InstanceInfo | null; loading: boolean; failure?: string }>({ info: null, loading: true })

  React.useEffect(() => {
    if (!allowed) return
    let cancelled = false
    whatsappApi
      .instance()
      .then((info) => !cancelled && setState({ info, loading: false }))
      .catch(
        (error: unknown) =>
          !cancelled &&
          setState({ info: null, loading: false, failure: error instanceof Error ? error.message : "Não foi possível verificar a conexão." }),
      )
    return () => {
      cancelled = true
    }
  }, [allowed])

  if (!allowed) {
    return (
      <IntegrationCard
        mark="WA"
        name="WhatsApp"
        badge={null}
        description="Você não tem acesso à Central de Atendimento. Quem administra o escritório pode liberar a permissão."
      />
    )
  }

  // Falha ao consultar = estado desconhecido: nunca tratado como conectado.
  const health: ConnectionHealth = state.failure ? "error" : connectionHealth(state.info, state.loading)
  const badge = WHATSAPP_BADGE[health]
  const phone = state.info?.instance?.phone
  const description =
    health === "loading"
      ? "Consultando a conexão do número do escritório."
      : health === "connected"
        ? `Conversas com clientes na Central de Atendimento${phone ? ` · ${formatPhone(phone)}` : ""}.`
        : (state.failure ?? connectionProblem(health, state.info))

  return (
    <IntegrationCard
      mark="WA"
      name="WhatsApp"
      badge={
        <StatusBadge tone={badge.tone} size="sm">
          {badge.label}
        </StatusBadge>
      }
      description={description}
    >
      <Link href="/atendimento" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        Abrir Central de Atendimento
      </Link>
    </IntegrationCard>
  )
}

type MonitoringHealth = "active" | "waiting" | "paused" | "failing" | "disabled" | "unconfigured"

const MONITORING_BADGE: Record<MonitoringHealth | "loading" | "error", { tone: Tone; label: string }> = {
  loading: { tone: "neutral", label: "Verificando…" },
  active: { tone: "success", label: "Ativo" },
  waiting: { tone: "neutral", label: "Aguardando" },
  paused: { tone: "warning", label: "Pausado" },
  failing: { tone: "danger", label: "Atrasado" },
  disabled: { tone: "neutral", label: "Desativado" },
  unconfigured: { tone: "neutral", label: "Não configurado" },
  error: { tone: "danger", label: "Indisponível" },
}

const fmtCheck = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
}

/**
 * Estado real do monitoramento automático (`GET /api/processes/monitoring`). "Ativo" só
 * quando o servidor confirma execuções concluídas recentemente — configurado não basta.
 */
function MonitoringCard() {
  const { can } = useSession()
  const allowed = can("processes.view")
  const [state, setState] = React.useState<{
    health: MonitoringHealth | "loading" | "error"
    lastHealthyRunAt?: string | null
    resumeAfter?: string | null
  }>({ health: "loading" })

  React.useEffect(() => {
    if (!allowed) return
    let cancelled = false
    fetch("/api/processes/monitoring", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => !cancelled && setState(data))
      .catch(() => !cancelled && setState({ health: "error" }))
    return () => {
      cancelled = true
    }
  }, [allowed])

  if (!allowed) {
    return (
      <IntegrationCard
        mark="MP"
        name="Monitoramento processual"
        badge={null}
        description="Você não tem acesso a Processos. Quem administra o escritório pode liberar a permissão."
      />
    )
  }

  const badge = MONITORING_BADGE[state.health]
  const last = state.lastHealthyRunAt ? ` Última verificação em ${fmtCheck(state.lastHealthyRunAt)}.` : ""
  const description = {
    loading: "Consultando o estado do monitoramento.",
    active: `Movimentações dos tribunais atualizadas automaticamente nos processos acompanhados.${last}`,
    waiting: "O monitoramento está configurado e ainda não fez a primeira verificação.",
    paused: `A fonte pública limitou as consultas; o monitoramento retoma sozinho${state.resumeAfter ? ` às ${fmtCheck(state.resumeAfter).split(" às ")[1]}` : ""}.${last}`,
    failing: `As atualizações automáticas estão atrasadas.${last} Você pode atualizar cada processo pelo botão "Atualizar".`,
    disabled: "A consulta automática de processos está desativada pela administração da Íntegra.",
    unconfigured: 'O monitoramento automático ainda não foi configurado. Atualize os processos pelo botão "Atualizar".',
    error: "Não foi possível verificar o monitoramento agora.",
  }[state.health]

  return (
    <IntegrationCard
      mark="MP"
      name="Monitoramento processual"
      badge={
        <StatusBadge tone={badge.tone} size="sm">
          {badge.label}
        </StatusBadge>
      }
      description={description}
    />
  )
}

function IntegrationsSection() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <AIPrivacyCard />
      <MonitoringCard />
      <WhatsAppCard />
      {UPCOMING.map((it) => (
        <IntegrationCard
          key={it.name}
          mark={it.mark}
          name={it.name}
          badge={
            <StatusBadge tone="neutral" size="sm" dot={false}>
              Em breve
            </StatusBadge>
          }
          description={it.description}
        />
      ))}
    </div>
  )
}

export function SettingsView() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { user, can, refresh } = useSession()
  const sections = SECTIONS.filter((s) => !("permission" in s) || can(s.permission))
  const raw = params.get("secao") as SectionId | null
  const section: SectionId = raw && sections.some((s) => s.id === raw) ? raw : "perfil"
  const go = (id: SectionId) => router.replace(`${pathname}?secao=${id}`, { scroll: false })

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Gerencie seu perfil, a equipe e as preferências do escritório." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Seções de configurações" className="-mx-4 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col">
            {sections.map((s) => {
              const active = s.id === section
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-9 w-full items-center gap-2.5 whitespace-nowrap rounded-control px-3 text-left text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                      active ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="settings-nav"
                        transition={{ type: "spring", stiffness: 520, damping: 42 }}
                        className="absolute inset-0 rounded-control border border-border bg-card shadow-xs"
                      />
                    )}
                    <s.icon className="relative size-4 shrink-0" strokeWidth={1.8} />
                    <span className="relative">{s.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="min-w-0"
          >
            {section === "perfil" && <ProfileSection />}
            {section === "escritorio" && <OfficeSection />}
            {section === "usuarios" && <MembersManager apiBase="/api/team/users" currentUserId={user.id} onChanged={refresh} />}
            {section === "permissoes" && <PermissionsSection />}
            {section === "integracoes" && <IntegrationsSection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
