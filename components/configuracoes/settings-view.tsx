"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Bell, Building, Check, KeyRound, Lock, Monitor, Moon, Plug, ShieldCheck, Sun, UserPlus, UserRound, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { PageHeader } from "@/components/ui/page-header"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/field"
import { StatusBadge, Tag } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { useTheme } from "@/lib/theme"
import { organization, users, CURRENT_USER_ID, getUser } from "@/lib/account"
import { PRACTICE_AREAS } from "@/lib/config"

const SECTIONS = [
  { id: "perfil", label: "Perfil", icon: UserRound, description: "Seus dados e preferências" },
  { id: "escritorio", label: "Escritório", icon: Building, description: "Dados do escritório e plano" },
  { id: "usuarios", label: "Usuários", icon: UsersRound, description: "Equipe com acesso à LEXA" },
  { id: "permissoes", label: "Permissões", icon: ShieldCheck, description: "O que cada perfil pode fazer" },
  { id: "notificacoes", label: "Notificações", icon: Bell, description: "Alertas e canais" },
  { id: "integracoes", label: "Integrações", icon: Plug, description: "Conecte suas ferramentas" },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

function SaveBar({ label = "Salvar alterações" }: { label?: string }) {
  return (
    <div className="flex justify-end border-t border-border px-5 py-3.5">
      <Button onClick={() => toast.success("Alterações salvas.")}>{label}</Button>
    </div>
  )
}

function ProfileSection() {
  const user = getUser(CURRENT_USER_ID)
  const { theme, setTheme } = useTheme()
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Perfil" description="Como você aparece para a equipe e para os clientes." />
        <div className="px-5 pb-5">
          <div className="mb-6 flex items-center gap-4">
            <UserAvatar name={user.name} size="xl" tone="dark" />
            <div>
              <p className="text-[15px] font-semibold">{user.name}</p>
              <p className="text-[13px] text-muted-foreground">
                {user.role} · {user.oab}
              </p>
              <Button variant="secondary" size="xs" className="mt-2" onClick={() => toast.success("Foto atualizada.")}>
                Alterar foto
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome completo" htmlFor="p-name">
              <TextInput id="p-name" defaultValue={user.name} />
            </Field>
            <Field label="Inscrição na OAB" htmlFor="p-oab">
              <TextInput id="p-oab" defaultValue={user.oab} />
            </Field>
            <Field label="E-mail" htmlFor="p-email">
              <TextInput id="p-email" type="email" defaultValue={user.email} />
            </Field>
            <Field label="Telefone" htmlFor="p-phone">
              <TextInput id="p-phone" defaultValue={user.phone} />
            </Field>
          </div>
        </div>
        <SaveBar />
      </Panel>

      <Panel>
        <PanelHeader title="Aparência" description="Escolha o tema da interface." />
        <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
          {(
            [
              { id: "light", label: "Claro", icon: Sun, preview: "bg-[#F8F8F6]", bar: "bg-white", line: "bg-[#E7E5E4]" },
              { id: "dark", label: "Escuro", icon: Moon, preview: "bg-[#0E0E0D]", bar: "bg-[#161615]", line: "bg-[#292826]" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={cn(
                "group rounded-[12px] border p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
                theme === t.id ? "border-foreground" : "border-border hover:border-border-strong",
              )}
            >
              <div className={cn("flex h-20 gap-1.5 overflow-hidden rounded-[8px] p-2", t.preview)}>
                <div className={cn("w-1/4 rounded-[4px]", t.bar)} />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className={cn("h-3 w-1/2 rounded-[3px]", t.bar)} />
                  <div className={cn("flex-1 rounded-[4px]", t.bar)}>
                    <div className={cn("m-1.5 h-1 w-2/3 rounded", t.line)} />
                    <div className="m-1.5 h-1 w-1/4 rounded bg-[#A88655]" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-1 pt-2">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <t.icon className="size-4 text-muted-foreground" /> {t.label}
                </span>
                {theme === t.id && <Check className="size-4" />}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Segurança" />
        <div className="divide-y divide-border px-5 pb-2">
          <div className="flex items-center gap-3 py-3.5">
            <KeyRound className="size-4 text-subtle" />
            <div className="flex-1">
              <p className="text-[13.5px] font-medium">Senha</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => toast.success("Enviamos um link para redefinir sua senha.")}>
              Alterar
            </Button>
          </div>
          <div className="flex items-center gap-3 py-3.5">
            <Lock className="size-4 text-subtle" />
            <div className="flex-1">
              <p className="text-[13.5px] font-medium">Verificação em duas etapas</p>
              <p className="text-[12px] text-muted-foreground">Não configurada</p>
            </div>
            <StatusBadge tone="neutral">Desativada</StatusBadge>
          </div>
          <div className="flex items-center gap-3 py-3.5">
            <Monitor className="size-4 text-subtle" />
            <div className="flex-1">
              <p className="text-[13.5px] font-medium">Sessões ativas</p>
              <p className="text-[12px] text-muted-foreground">Este navegador · agora</p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function OfficeSection() {
  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-4 bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklab,var(--gold)_12%,transparent),transparent_60%)] p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold-dark">Plano {organization.plan}</p>
            <p className="mt-1 text-[15px] font-semibold">
              {users.length} {users.length === 1 ? "usuário" : "usuários"}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              toast("Nossa equipe comercial entrará em contato.", {
                description: "Plano Escritório: usuários ilimitados e monitoramento processual.",
              })
            }
          >
            Conhecer plano Escritório
          </Button>
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Dados do escritório" description="Utilizados em contratos, procurações e comunicações." />
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Nome fantasia" htmlFor="o-name">
            <TextInput id="o-name" defaultValue={organization.name} />
          </Field>
          <Field label="CNPJ" htmlFor="o-cnpj">
            <TextInput id="o-cnpj" defaultValue={organization.cnpj} />
          </Field>
          <Field label="Razão social" htmlFor="o-legal" className="sm:col-span-2">
            <TextInput id="o-legal" defaultValue={organization.legalName} />
          </Field>
          <Field label="Endereço" htmlFor="o-address" className="sm:col-span-2">
            <TextInput id="o-address" defaultValue={organization.address} />
          </Field>
          <Field label="Telefone" htmlFor="o-phone">
            <TextInput id="o-phone" defaultValue={organization.phone} />
          </Field>
          <Field label="E-mail" htmlFor="o-email">
            <TextInput id="o-email" defaultValue={organization.email} />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[12.5px] font-medium">Áreas de atuação</p>
            <div className="flex flex-wrap gap-1.5">
              {PRACTICE_AREAS.map((a) => (
                <Tag key={a}>{a}</Tag>
              ))}
            </div>
          </div>
        </div>
        <SaveBar />
      </Panel>
    </div>
  )
}

function UsersSection() {
  return (
    <Panel>
      <PanelHeader
        title="Usuários"
        description={`${users.length} ${users.length === 1 ? "pessoa" : "pessoas"} com acesso`}
        action={
          <Button size="sm" onClick={() => toast.success("Convite enviado.", { description: "O novo usuário receberá o acesso por e-mail." })}>
            <UserPlus /> Convidar
          </Button>
        }
      />
      <TableShell className="rounded-none border-x-0 border-b-0 shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Cargo</Th>
                <Th>Permissão</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-0">
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={u.name} tone={u.id === CURRENT_USER_ID ? "dark" : undefined} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.name} {u.id === CURRENT_USER_ID && <span className="text-[11.5px] font-normal text-subtle">(você)</span>}
                        </p>
                        <p className="truncate text-[12px] text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-muted-foreground">{u.role}</Td>
                  <Td>
                    <StatusBadge tone={u.permission === "Administrador" ? "gold" : "neutral"} dot={false}>
                      {u.permission}
                    </StatusBadge>
                  </Td>
                  <Td>
                    <StatusBadge tone="success">Ativo</StatusBadge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>
    </Panel>
  )
}

const MODULES = ["Clientes", "Processos", "Tarefas e agenda", "Documentos", "Financeiro", "Configurações"]
const ROLES = ["Administrador", "Advogado", "Colaborador"] as const
const INITIAL_PERMS: Record<(typeof ROLES)[number], boolean[]> = {
  Administrador: [true, true, true, true, true, true],
  Advogado: [true, true, true, true, false, false],
  Colaborador: [true, true, true, true, false, false],
}

function PermissionsSection() {
  const [perms, setPerms] = React.useState(INITIAL_PERMS)
  return (
    <Panel>
      <PanelHeader title="Permissões" description="Defina o acesso de cada perfil aos módulos da LEXA." />
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[520px] border-separate border-spacing-0">
          <thead>
            <tr>
              <Th>Módulo</Th>
              {ROLES.map((r) => (
                <Th key={r} className="text-center">
                  {r}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child_td]:border-0">
            {MODULES.map((m, i) => (
              <tr key={m}>
                <Td className="font-medium">{m}</Td>
                {ROLES.map((r) => (
                  <Td key={r} className="text-center">
                    <span className="inline-flex">
                      <ToggleSwitch
                        label={`${m} — ${r}`}
                        checked={perms[r][i]}
                        disabled={r === "Administrador"}
                        onChange={(v) => setPerms((p) => ({ ...p, [r]: p[r].map((x, j) => (j === i ? v : x)) }))}
                      />
                    </span>
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SaveBar label="Salvar permissões" />
    </Panel>
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
  const raw = params.get("secao") as SectionId | null
  const section: SectionId = raw && SECTIONS.some((s) => s.id === raw) ? raw : "perfil"
  const go = (id: SectionId) => router.replace(`${pathname}?secao=${id}`, { scroll: false })

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Gerencie seu perfil, a equipe e as preferências do escritório." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Seções de configurações" className="-mx-4 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col">
            {SECTIONS.map((s) => {
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
            {section === "usuarios" && <UsersSection />}
            {section === "permissoes" && <PermissionsSection />}
            {section === "notificacoes" && <NotificationsSection />}
            {section === "integracoes" && <IntegrationsSection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
