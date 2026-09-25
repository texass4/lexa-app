"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Bell, Building, Plug, ShieldCheck, UserRound, UsersRound, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { ProfileSection } from "./profile-section"
import { OfficeSection } from "./office-section"
import { MembersManager } from "./members-manager"
import { PermissionsSection } from "./permissions-section"
import { useSession } from "@/lib/auth/session"
import type { Permission } from "@/lib/auth/permissions"

const SECTIONS = [
  { id: "perfil", label: "Perfil", icon: UserRound, description: "Seus dados e preferências" },
  { id: "escritorio", label: "Escritório", icon: Building, description: "Dados do escritório e plano" },
  { id: "usuarios", label: "Usuários", icon: UsersRound, description: "Equipe com acesso à LEXA", permission: "users.manage" },
  { id: "permissoes", label: "Permissões", icon: ShieldCheck, description: "O que cada perfil pode fazer", permission: "users.manage" },
  { id: "notificacoes", label: "Notificações", icon: Bell, description: "Alertas e canais" },
  { id: "integracoes", label: "Integrações", icon: Plug, description: "Conecte suas ferramentas" },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon; description: string; permission?: Permission }[]

type SectionId = (typeof SECTIONS)[number]["id"]

function SaveBar({ label = "Salvar alterações" }: { label?: string }) {
  return (
    <div className="flex justify-end border-t border-border px-5 py-3.5">
      <Button onClick={() => toast.success("Alterações salvas.")}>{label}</Button>
    </div>
  )
}

const NOTIFS = [
  { label: "Prazo se aproximando", hint: "2 dias úteis antes do vencimento" },
  { label: "Documento recebido", hint: "Quando um cliente envia um arquivo" },
  { label: "Consulta em breve", hint: "30 minutos antes do horário" },
  { label: "Contrato assinado", hint: "Assinatura eletrônica concluída" },
]
const CHANNELS = ["No app", "E-mail", "WhatsApp"]

function NotificationsSection() {
  // Padrão: tudo no app; e-mail exceto consulta; WhatsApp só para prazo e consulta.
  const [state, setState] = React.useState(() => NOTIFS.map((_, i) => [true, i !== 2, i === 0 || i === 2]))
  return (
    <Panel>
      <PanelHeader title="Notificações" description="Escolha como e quando a LEXA avisa você." />
      <div className="border-t border-border">
        <div className="hidden grid-cols-[1fr_repeat(3,84px)] gap-2 border-b border-border bg-surface-muted/40 px-5 py-2.5 text-[11.5px] font-medium text-muted-foreground sm:grid">
          <span>Evento</span>
          {CHANNELS.map((c) => (
            <span key={c} className="text-center">
              {c}
            </span>
          ))}
        </div>
        <ul className="divide-y divide-border">
          {NOTIFS.map((n, i) => (
            <li key={n.label} className="grid grid-cols-1 gap-3 px-5 py-3.5 sm:grid-cols-[1fr_repeat(3,84px)] sm:items-center sm:gap-2">
              <div>
                <p className="text-[13.5px] font-medium">{n.label}</p>
                <p className="text-[12px] text-muted-foreground">{n.hint}</p>
              </div>
              {CHANNELS.map((c, j) => (
                <label key={c} className="flex items-center gap-2 sm:justify-center">
                  <ToggleSwitch
                    label={`${n.label} — ${c}`}
                    checked={state[i][j]}
                    onChange={(v) => setState((s) => s.map((row, x) => (x === i ? row.map((val, y) => (y === j ? v : val)) : row)))}
                  />
                  <span className="text-[12px] text-muted-foreground sm:hidden">{c}</span>
                </label>
              ))}
            </li>
          ))}
        </ul>
      </div>
      <SaveBar label="Salvar preferências" />
    </Panel>
  )
}

/** `builtin`: funciona de fato no LEXA e não se liga/desliga por aqui. */
type IntegrationStatus = "available" | "connected" | "builtin"

const INTEGRATIONS: { name: string; description: string; status: IntegrationStatus; mark: string }[] = [
  { name: "Monitoramento processual", description: "Movimentações do DataJud (CNJ) direto nos processos.", status: "builtin", mark: "MP" },
  { name: "WhatsApp Business", description: "Converse com clientes e registre o histórico automaticamente.", status: "available", mark: "WA" },
  { name: "Google Agenda", description: "Sincronize consultas, audiências e prazos.", status: "available", mark: "GA" },
  { name: "Assinatura eletrônica", description: "Envie contratos e procurações para assinatura.", status: "available", mark: "AE" },
  { name: "Outlook e Gmail", description: "Vincule e-mails a clientes e processos.", status: "available", mark: "@" },
  { name: "Emissão de boletos e Pix", description: "Cobranças de honorários com baixa automática.", status: "available", mark: "R$" },
]

function IntegrationsSection() {
  const [connected, setConnected] = React.useState<Set<string>>(
    () => new Set(INTEGRATIONS.filter((i) => i.status !== "available").map((i) => i.name)),
  )
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {INTEGRATIONS.map((it) => {
        const on = connected.has(it.name)
        return (
          <Panel key={it.name} className="flex flex-col p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-muted/60 text-[12px] font-semibold text-foreground">
                {it.mark}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13.5px] font-semibold">{it.name}</p>
                  {on && (
                    <StatusBadge tone="success" size="sm">
                      Conectado
                    </StatusBadge>
                  )}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{it.description}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              {it.status === "builtin" ? (
                <span className="text-[12px] text-gold-dark">Ativo em todos os processos</span>
              ) : on ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConnected((s) => {
                      const n = new Set(s)
                      n.delete(it.name)
                      return n
                    })
                    toast(`${it.name} desconectado.`)
                  }}
                >
                  Desconectar
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setConnected((s) => new Set(s).add(it.name))
                    toast.success(`${it.name} conectado.`, { description: "Ambiente de demonstração — nenhuma conta real foi vinculada." })
                  }}
                >
                  Conectar
                </Button>
              )}
            </div>
          </Panel>
        )
      })}
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
                      "relative flex h-9 w-full items-center gap-2.5 whitespace-nowrap rounded-[9px] px-3 text-left text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
                      active ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="settings-nav"
                        transition={{ type: "spring", stiffness: 520, damping: 42 }}
                        className="absolute inset-0 rounded-[9px] border border-border bg-card shadow-xs"
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
            {section === "notificacoes" && <NotificationsSection />}
            {section === "integracoes" && <IntegrationsSection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
