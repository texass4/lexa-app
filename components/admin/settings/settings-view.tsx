"use client"

import * as React from "react"
import { toast } from "sonner"
import { Bot, Building, Cpu, Gauge, KeyRound, MessageCircle, ShieldCheck, SlidersHorizontal, Sparkles, Wrench } from "lucide-react"
import { cn } from "cn"
import { AnimatePresence, motion } from "framer-motion"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextArea, TextInput } from "@/components/ui/field"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { StatusBadge } from "@/components/ui/status-badge"
import { ErrorState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { adminFetch, useAdminData } from "@/lib/admin/client"
import { LIMIT_KEYS, LIMIT_META, type PlanLimits } from "@/lib/admin/catalog"
import { WHATSAPP_PROVIDERS, type PlatformSettings } from "@/lib/admin/settings"
import { AdminHeader } from "../ui/admin-header"
import { ConfirmAction, type ConfirmRequest } from "../ui/confirm-action"
import { useAdminShell } from "../shell/admin-context"

interface SettingsData {
  settings: PlatformSettings
  plans: { name: string; status: string }[]
  secrets: { ai: boolean; whatsapp: boolean; datajud: boolean; email: boolean }
  ai: { provider: { id: string; label: string }; model: string; lightModel: string }
}

const SECTIONS = [
  { id: "plataforma", label: "Plataforma", icon: Building },
  { id: "geral", label: "Geral", icon: SlidersHorizontal },
  { id: "recursos", label: "Recursos", icon: Sparkles },
  { id: "ia", label: "IA", icon: Bot },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "limites", label: "Limites padrão", icon: Gauge },
  { id: "manutencao", label: "Manutenção", icon: Wrench },
  { id: "administracao", label: "Administração", icon: ShieldCheck },
]

function Row({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium">{title}</p>
        {description && <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SecretStatus({ ok, name }: { ok: boolean; name: string }) {
  return (
    <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <KeyRound className="size-3.5" />
      Credencial ({name}):{" "}
      <StatusBadge tone={ok ? "success" : "neutral"} size="sm">
        {ok ? "configurada no servidor" : "não configurada"}
      </StatusBadge>
    </p>
  )
}

function Section({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Panel id={id} className={cn("scroll-mt-24", className)}>
      <PanelHeader title={title} description={description} className="border-b border-border pb-4" />
      <div className="divide-y divide-border">{children}</div>
    </Panel>
  )
}

function SettingsForm({ data, onSaved }: { data: SettingsData; onSaved: (s: PlatformSettings) => void }) {
  const { refresh } = useAdminShell()
  const [s, setS] = React.useState(data.settings)
  const [busy, setBusy] = React.useState(false)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings)
  const set = <K extends keyof PlatformSettings>(section: K, patch: Partial<PlatformSettings[K]>) =>
    setS((cur) => ({ ...cur, [section]: { ...cur[section], ...patch } }))

  const persist = async (next: PlatformSettings) => {
    setBusy(true)
    try {
      const { settings } = await adminFetch<{ settings: PlatformSettings }>("/api/admin/settings", "PUT", next)
      toast.success("Configurações salvas.")
      onSaved(settings)
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
      throw err
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    const turningOn = s.maintenance.enabled && !data.settings.maintenance.enabled
    if (!turningOn) return void persist(s).catch(() => undefined)
    setConfirm({
      title: "Ligar o modo manutenção?",
      description:
        "Todos os escritórios perdem o acesso ao CRM assim que você salvar (inclusive quem está usando agora) e veem a mensagem de manutenção. O Admin continua funcionando.",
      confirmLabel: "Ligar manutenção e salvar",
      requireText: "MANUTENÇÃO",
      onConfirm: () => persist(s),
    })
  }

  const numberInput = (value: number, onChange: (n: number) => void, props: React.ComponentProps<"input"> = {}) => (
    <TextInput
      inputMode="numeric"
      className="w-24 text-right tabular"
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
      {...props}
    />
  )

  const activePlans = data.plans.filter((p) => p.status === "active")

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Seções" className="hidden lg:block">
        <ul className="sticky top-24 space-y-0.5">
          {SECTIONS.map((sec) => (
            <li key={sec.id}>
              <a
                href={`#${sec.id}`}
                className="flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <sec.icon className="size-3.5" /> {sec.label}
                {sec.id === "manutencao" && s.maintenance.enabled && <span className="ml-auto size-1.5 rounded-full bg-warning" />}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-5 pb-24">
        <Section id="plataforma" title="Dados da plataforma" description="Como a Íntegra se apresenta para os escritórios.">
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Nome da plataforma" htmlFor="st-name">
              <TextInput id="st-name" value={s.platform.name} onChange={(e) => set("platform", { name: e.target.value })} />
            </Field>
            <Field label="Site" htmlFor="st-site" optional>
              <TextInput
                id="st-site"
                placeholder="https://"
                value={s.platform.website}
                onChange={(e) => set("platform", { website: e.target.value })}
              />
            </Field>
            <Field label="E-mail de suporte" htmlFor="st-email" optional>
              <TextInput
                id="st-email"
                type="email"
                value={s.platform.supportEmail}
                onChange={(e) => set("platform", { supportEmail: e.target.value })}
              />
            </Field>
            <Field label="Telefone/WhatsApp de suporte" htmlFor="st-phone" optional>
              <TextInput id="st-phone" value={s.platform.supportPhone} onChange={(e) => set("platform", { supportPhone: e.target.value })} />
            </Field>
          </div>
        </Section>

        <Section id="geral" title="Configurações gerais" description="Cadastro de novos escritórios, testes e alertas.">
          <Row title="Cadastro público" description="Permite que escritórios se cadastrem sozinhos em /cadastro.">
            <ToggleSwitch label="Cadastro público" checked={s.general.publicSignup} onChange={(v) => set("general", { publicSignup: v })} />
          </Row>
          <Row title="Exigir aprovação" description="Cadastros públicos ficam “aguardando aprovação” até você aprovar. Desligado, já entram ativos.">
            <ToggleSwitch
              label="Exigir aprovação"
              checked={s.general.requireApproval}
              disabled={!s.general.publicSignup}
              onChange={(v) => set("general", { requireApproval: v })}
            />
          </Row>
          <Row title="Plano padrão" description="Plano de quem se cadastra pela página pública.">
            <NativeSelect
              aria-label="Plano padrão"
              value={s.general.defaultPlan}
              onChange={(e) => set("general", { defaultPlan: e.target.value })}
              className="w-48"
            >
              {activePlans.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </NativeSelect>
          </Row>
          <Row title="Dias de teste" description="Período de teste de escritórios novos. 0 = sem teste.">
            {numberInput(s.general.trialDays, (n) => set("general", { trialDays: Math.min(n, 365) }), { "aria-label": "Dias de teste" })}
          </Row>
          <Row title="Alerta de uso a partir de" description="Percentual do limite em que o escritório entra em “próximo do limite”.">
            <div className="flex items-center gap-1.5">
              {numberInput(s.general.usageWarningPercent, (n) => set("general", { usageWarningPercent: Math.min(Math.max(n, 50), 99) }), {
                "aria-label": "Percentual de alerta",
              })}
              <span className="text-[12.5px] text-muted-foreground">%</span>
            </div>
          </Row>
          <Row
            title="Aplicar limite de usuários"
            description="Bloqueia convites do sócio quando o escritório atinge o limite de usuários do plano. O Admin pode passar do limite."
          >
            <ToggleSwitch
              label="Aplicar limite de usuários"
              checked={s.general.enforceUserLimits}
              onChange={(v) => set("general", { enforceUserLimits: v })}
            />
          </Row>
        </Section>

        <Section id="recursos" title="Recursos disponíveis" description="Liga ou desliga recursos para toda a plataforma.">
          <Row title="Consulta automática ao DataJud" description={<SecretStatus ok={data.secrets.datajud} name="DATAJUD_API_KEY" />}>
            <ToggleSwitch label="DataJud" checked={s.features.datajud} onChange={(v) => set("features", { datajud: v })} />
          </Row>
          <Row title="Integração WhatsApp" description="Em preparação: o consumo já é medido por escritório (usage_events).">
            <ToggleSwitch label="WhatsApp" checked={s.features.whatsapp} onChange={(v) => set("features", { whatsapp: v })} />
          </Row>
          <Row
            title="Assistente de IA"
            description="Ainda sem efeito: a Íntegra IA é ligada no servidor (AI_ENABLED e GEMINI_API_KEY). Cada chamada já é medida e limitada pelo plano do escritório (Consumo de IA)."
          >
            <ToggleSwitch label="IA" checked={s.features.ai} onChange={(v) => set("features", { ai: v })} />
          </Row>
        </Section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Section id="ia" title="Configurações de IA">
            <div className="space-y-4 p-5">
              {/* Um provedor só no núcleo da Íntegra; modelos definidos no ambiente do servidor. */}
              <dl className="divide-y divide-border rounded-[10px] border border-border text-[13px]">
                {[
                  ["Provedor", data.ai.provider.label],
                  ["Modelo das análises (AI_MODEL)", data.ai.model],
                  ["Modelo das operações simples (AI_MODEL_LIGHT)", data.ai.lightModel],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 px-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular break-all text-right">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[12px] leading-relaxed text-subtle">
                Para trocar, altere as variáveis no servidor e publique de novo. Os preços usados na estimativa de custo podem ser ajustados em
                AI_PRICES.
              </p>
              <SecretStatus ok={data.secrets.ai} name="GEMINI_API_KEY" />
            </div>
          </Section>
          <Section id="whatsapp" title="Configurações WhatsApp">
            <div className="space-y-4 p-5">
              <Field label="Provedor" htmlFor="st-wa-provider">
                <NativeSelect id="st-wa-provider" value={s.whatsapp.provider} onChange={(e) => set("whatsapp", { provider: e.target.value })}>
                  {WHATSAPP_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Número comercial" htmlFor="st-wa-number" optional>
                <TextInput
                  id="st-wa-number"
                  placeholder="+55 48 99999-0000"
                  value={s.whatsapp.businessNumber}
                  onChange={(e) => set("whatsapp", { businessNumber: e.target.value })}
                />
              </Field>
              <SecretStatus ok={data.secrets.whatsapp} name="ZAPI_TOKEN" />
            </div>
          </Section>
        </div>

        <Section id="limites" title="Limites padrão" description="Sugeridos ao criar um plano novo. Em branco = ilimitado.">
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
            {LIMIT_KEYS.map((k) => (
              <Field
                key={k}
                label={`${LIMIT_META[k].label}${k === "storage" ? " (MB)" : LIMIT_META[k].monthly ? " / mês" : ""}`}
                htmlFor={`st-lim-${k}`}
              >
                <TextInput
                  id={`st-lim-${k}`}
                  inputMode="numeric"
                  placeholder="Ilimitado"
                  className="tabular"
                  value={s.defaultLimits[k] === null ? "" : String(s.defaultLimits[k])}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "")
                    set("defaultLimits", { [k]: raw === "" ? null : Number(raw) } as Partial<PlanLimits>)
                  }}
                />
              </Field>
            ))}
          </div>
        </Section>

        <Section
          id="manutencao"
          title="Manutenção"
          description="Bloqueia o acesso de todos os escritórios (no banco de dados, não só na tela). O Admin continua disponível."
          className={cn(s.maintenance.enabled && "border-warning/40")}
        >
          <Row
            title="Modo manutenção"
            description={
              s.maintenance.enabled ? (
                <span className="text-warning">
                  Ligado — {data.settings.maintenance.enabled ? "escritórios sem acesso agora." : "será aplicado ao salvar."}
                </span>
              ) : (
                "Desligado — acesso normal."
              )
            }
          >
            <ToggleSwitch label="Modo manutenção" checked={s.maintenance.enabled} onChange={(v) => set("maintenance", { enabled: v })} />
          </Row>
          <div className="p-5">
            <Field label="Mensagem exibida aos escritórios" htmlFor="st-maint-msg">
              <TextArea
                id="st-maint-msg"
                maxLength={500}
                value={s.maintenance.message}
                onChange={(e) => set("maintenance", { message: e.target.value })}
              />
            </Field>
          </div>
        </Section>

        <Section id="administracao" title="Configurações administrativas">
          <Row title="Retenção da auditoria" description="Registros mais antigos são apagados automaticamente (mínimo 30 dias).">
            <div className="flex items-center gap-1.5">
              {numberInput(s.admin.auditRetentionDays, (n) => set("admin", { auditRetentionDays: n }), { "aria-label": "Dias de retenção" })}
              <span className="text-[12.5px] text-muted-foreground">dias</span>
            </div>
          </Row>
          <Row
            title="Acesso ao Admin"
            description="Só a conta Super Admin definida em LEXA_SUPERADMIN_EMAIL no servidor. Cada página e cada ação conferem o papel no servidor."
          >
            <StatusBadge tone="success">
              <span className="inline-flex items-center gap-1">
                <Cpu className="size-3" /> Protegido
              </span>
            </StatusBadge>
          </Row>
        </Section>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-[14px] border border-border bg-popover px-4 py-3 shadow-float md:left-[calc(76px+1.5rem)] lg:left-[calc(256px+2.5rem)] lg:right-10"
            role="region"
            aria-label="Alterações não salvas"
          >
            <p className="text-[13px] font-medium">Você tem alterações não salvas.</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setS(data.settings)} disabled={busy}>
                Descartar
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmAction request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

export function SettingsView() {
  const { data, error, reload, setData } = useAdminData<SettingsData>("/api/admin/settings")
  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Sistema"
        title="Configurações"
        description="Configurações globais da Íntegra. Chaves de API e segredos ficam só nas variáveis de ambiente do servidor — nunca aqui."
      />
      {error && !data ? (
        <Panel>
          <ErrorState onRetry={reload} description={error} />
        </Panel>
      ) : !data ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[220px] rounded-[14px]" />
          ))}
        </div>
      ) : (
        <SettingsForm key={JSON.stringify(data.settings)} data={data} onSaved={(settings) => setData((d) => (d ? { ...d, settings } : d))} />
      )}
    </div>
  )
}
