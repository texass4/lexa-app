"use client"

import * as React from "react"
import { Copy, Link2, QrCode, RefreshCw, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Skeleton } from "@/components/ui/skeleton"
import { whatsappApi } from "@/lib/whatsapp/client"
import { formatPhone } from "@/lib/whatsapp/phone"
import { useInbox } from "./inbox-provider"

type Health = "loading" | "connected" | "disconnected" | "unconfigured" | "error"

export function useConnectionHealth(): Health {
  const { instance, instanceLoading } = useInbox()
  if (instanceLoading && !instance) return "loading"
  if (!instance?.instance) return "unconfigured"
  if (instance.live?.error) return "error"
  return instance.instance.status === "connected" ? "connected" : "disconnected"
}

const LABEL: Record<Health, string> = {
  loading: "Verificando conexão…",
  connected: "WhatsApp conectado",
  disconnected: "WhatsApp desconectado",
  unconfigured: "WhatsApp não configurado",
  error: "Z-API indisponível",
}

export function ConnectionBadge({ className }: { className?: string }) {
  const health = useConnectionHealth()
  const { instance } = useInbox()
  const phone = instance?.instance?.phone
  return (
    <p className={cn("flex items-center gap-1.5 text-[12px] text-muted-foreground", className)}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          health === "connected" ? "bg-success" : health === "loading" ? "animate-pulse bg-subtle" : health === "unconfigured" ? "bg-subtle" : "bg-danger",
        )}
      />
      <span className="truncate">
        {LABEL[health]}
        {health === "connected" && phone ? ` · ${formatPhone(phone)}` : ""}
      </span>
    </p>
  )
}

/** Aviso fino no topo da conversa quando o envio não vai funcionar. */
export function ConnectionNotice() {
  const health = useConnectionHealth()
  const { instance } = useInbox()
  const [open, setOpen] = React.useState(false)
  if (health === "connected" || health === "loading") return null
  const text =
    health === "unconfigured"
      ? "O WhatsApp do escritório ainda não foi configurado. Você pode ler o histórico, mas o envio está desativado."
      : health === "error"
        ? (instance?.live?.error ?? "Não foi possível falar com a Z-API.")
        : "O WhatsApp do escritório está desconectado. Mensagens novas não chegam nem saem até reconectar."
  return (
    <>
      <div className="flex shrink-0 items-center gap-2.5 border-b border-warning/15 bg-warning-soft px-4 py-2 text-[12.5px] text-warning">
        <TriangleAlert className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">{text}</span>
        {instance?.canManage && (
          <Button variant="secondary" size="xs" onClick={() => setOpen(true)}>
            Configurar
          </Button>
        )}
      </div>
      <ConnectionDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function ConnectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Conexão com o WhatsApp" description="Z-API · número do escritório" icon={<Smartphone />}>
      <ConnectionSetup />
    </Modal>
  )
}

/** Diagnóstico e passos de conexão. Só quem administra o escritório vê os detalhes. */
export function ConnectionSetup() {
  const { instance: info, reloadInstance, instanceLoading } = useInbox()
  const health = useConnectionHealth()
  const [qr, setQr] = React.useState<{ image?: string; needsPasskey?: boolean } | null>(null)
  const [busy, setBusy] = React.useState<"qr" | "webhooks" | null>(null)

  if (!info) return <Skeleton className="h-40 w-full rounded-[12px]" />

  if (!info.canManage) {
    return (
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        {health === "connected"
          ? "O WhatsApp do escritório está conectado."
          : "A conexão do WhatsApp é feita por quem administra o escritório. Fale com o sócio responsável."}
      </p>
    )
  }

  const loadQr = async () => {
    setBusy("qr")
    try {
      setQr(await whatsappApi.qrCode())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o QR Code.")
    } finally {
      setBusy(null)
    }
  }

  const registerWebhooks = async () => {
    setBusy("webhooks")
    try {
      await whatsappApi.registerWebhooks()
      toast.success("Webhooks cadastrados na Z-API.", { description: "Mensagens recebidas passam a chegar aqui na hora." })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar os webhooks.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5 text-[13.5px]">
      <Step n={1} title="Credenciais no servidor" done={info.missing.length === 0}>
        {info.missing.length ? (
          <>
            <p className="text-muted-foreground">
              Preencha no <code className="rounded bg-surface-muted px-1 font-mono text-[12px]">.env.local</code> do servidor e reinicie o LEXA:
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {info.missing.map((name) => (
                <li key={name} className="rounded-[6px] border border-border bg-surface-muted/60 px-1.5 py-0.5 font-mono text-[11.5px]">
                  {name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-subtle">Os tokens ficam só no servidor — nunca na tela, no navegador ou no repositório.</p>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="size-4 text-success" /> Configuradas no servidor.
          </p>
        )}
      </Step>

      <Step n={2} title="Número conectado" done={health === "connected"}>
        {health === "connected" ? (
          <p className="text-muted-foreground">
            Conectado{info.instance?.phone ? ` como ${formatPhone(info.instance.phone)}` : ""}
            {info.live?.smartphoneConnected === false ? " — o celular está sem internet." : "."}
          </p>
        ) : info.instance ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">
              {info.live?.error ?? "Abra o WhatsApp do escritório › Aparelhos conectados › Conectar aparelho e leia o QR Code."}
            </p>
            {qr?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.image} alt="QR Code para conectar o WhatsApp" className="size-56 rounded-[12px] border border-border bg-white p-2" />
            ) : qr?.needsPasskey ? (
              <p className="text-[12.5px] text-warning">Este aparelho pede confirmação por passkey. Conclua a conexão pelo painel da Z-API.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={loadQr} disabled={busy === "qr"}>
                <QrCode /> {qr ? "Gerar outro QR Code" : "Mostrar QR Code"}
              </Button>
              <Button variant="ghost" size="sm" onClick={reloadInstance} disabled={instanceLoading}>
                <RefreshCw className={cn(instanceLoading && "animate-spin")} /> Verificar de novo
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Disponível depois das credenciais.</p>
        )}
      </Step>

      <Step n={3} title="Receber mensagens (webhook)" done={false} optional>
        {info.webhookUrl ? (
          <div className="space-y-2.5">
            <p className="text-muted-foreground">A Z-API avisa o LEXA a cada mensagem por este endereço (ele leva o segredo do webhook):</p>
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-muted/50 py-1.5 pr-1.5 pl-3">
              <Link2 className="size-3.5 shrink-0 text-subtle" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">{info.webhookUrl.replace(/token=[^&]+/, "token=••••••")}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copiar endereço do webhook"
                onClick={() => {
                  navigator.clipboard?.writeText(info.webhookUrl!).catch(() => {})
                  toast.success("Endereço copiado.")
                }}
              >
                <Copy />
              </Button>
            </div>
            {info.webhookHttps === false ? (
              <p className="text-[12.5px] text-warning">
                A Z-API só aceita HTTPS. Em produção, defina <code className="font-mono">ZAPI_WEBHOOK_BASE_URL</code> com o endereço público do LEXA.
              </p>
            ) : (
              <Button variant="secondary" size="sm" onClick={registerWebhooks} disabled={busy === "webhooks" || !info.instance}>
                Cadastrar automaticamente na Z-API
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">Defina ZAPI_WEBHOOK_SECRET no servidor.</p>
        )}
      </Step>
    </div>
  )
}

function Step({ n, title, done, optional, children }: { n: number; title: string; done: boolean; optional?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex gap-3">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold",
          done ? "bg-success-soft text-success" : "bg-surface-muted text-muted-foreground",
        )}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold text-foreground">
          {title}
          {optional && !done && <span className="ml-1.5 font-normal text-subtle">(uma vez)</span>}
        </h3>
        <div className="mt-1">{children}</div>
      </div>
    </section>
  )
}
