"use client"

import * as React from "react"
import { Copy, Link2, QrCode, RefreshCw, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Skeleton } from "@/components/ui/skeleton"
import { whatsappApi } from "@/lib/whatsapp/client"
import { CHECK_FAILED, CONNECTION_LABEL as LABEL, connectionHealth, connectionProblem, type ConnectionHealth } from "@/lib/whatsapp/connection"
import { publicMessage } from "@/lib/core/public-error"
import { formatPhone } from "@/lib/whatsapp/phone"
import { useInbox } from "./inbox-provider"

export function useConnectionHealth(): ConnectionHealth {
  const { instance, instanceLoading } = useInbox()
  return connectionHealth(instance, instanceLoading)
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
  const text = connectionProblem(health, instance)
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

function ConnectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Conexão com o WhatsApp" description="Número do WhatsApp do escritório" icon={<Smartphone />}>
      <ConnectionSetup />
    </Modal>
  )
}

/** Diagnóstico e passos de conexão. Só quem administra o escritório vê os detalhes. */
function ConnectionSetup() {
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
      toast.error(publicMessage(error, "Não foi possível gerar o QR Code. Tente novamente em instantes."))
    } finally {
      setBusy(null)
    }
  }

  const registerWebhooks = async () => {
    setBusy("webhooks")
    try {
      await whatsappApi.registerWebhooks()
      toast.success("Recebimento de mensagens ativado.", { description: "Mensagens recebidas passam a chegar aqui na hora." })
    } catch (error) {
      toast.error(publicMessage(error, "Não foi possível ativar o recebimento de mensagens. Tente novamente em instantes."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5 text-[13.5px]">
      <Step n={1} title="Ativação da conexão" done={info.activated}>
        {info.activated ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="size-4 text-success" /> Conexão ativada para o escritório.
          </p>
        ) : (
          <p className="text-muted-foreground">A conexão do WhatsApp ainda não foi ativada para o escritório. Fale com o suporte da Íntegra para concluir a ativação.</p>
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
              {info.live?.error ? publicMessage(info.live.error, CHECK_FAILED) : "Abra o WhatsApp do escritório › Aparelhos conectados › Conectar aparelho e leia o QR Code."}
            </p>
            {qr?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.image} alt="QR Code para conectar o WhatsApp" className="size-56 rounded-[12px] border border-border bg-white p-2" />
            ) : qr?.needsPasskey ? (
              <p className="text-[12.5px] text-warning">Este aparelho pede uma confirmação extra. Fale com o suporte da Íntegra para concluir a conexão.</p>
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
          <p className="text-muted-foreground">Disponível depois da ativação.</p>
        )}
      </Step>

      <Step n={3} title="Receber mensagens na hora" done={false} optional>
        {info.webhookUrl ? (
          <div className="space-y-2.5">
            <p className="text-muted-foreground">O WhatsApp avisa a Íntegra a cada mensagem nova por este endereço. Ele é privado: não compartilhe.</p>
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-muted/50 py-1.5 pr-1.5 pl-3">
              <Link2 className="size-3.5 shrink-0 text-subtle" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">{info.webhookUrl.replace(/token=[^&]+/, "token=••••••")}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copiar endereço"
                onClick={() => {
                  navigator.clipboard?.writeText(info.webhookUrl!).catch(() => {})
                  toast.success("Endereço copiado.")
                }}
              >
                <Copy />
              </Button>
            </div>
            {info.webhookHttps === false ? (
              <p className="text-[12.5px] text-warning">O recebimento automático ainda não pode ser ativado por aqui. Fale com o suporte da Íntegra.</p>
            ) : (
              <Button variant="secondary" size="sm" onClick={registerWebhooks} disabled={busy === "webhooks" || !info.instance}>
                Ativar recebimento automático
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">O recebimento automático ainda não foi ativado. Fale com o suporte da Íntegra.</p>
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
