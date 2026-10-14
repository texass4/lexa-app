"use client"

import * as React from "react"
import { Smartphone, TriangleAlert } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Skeleton } from "@/components/ui/skeleton"
import { CONNECTION_LABEL as LABEL, connectionHealth, connectionProblem, type ConnectionHealth } from "@/lib/whatsapp/connection"
import { formatPhone } from "@/lib/whatsapp/phone"
import { useInbox } from "./inbox-provider"
import { MetaConnectionSetup } from "./meta-connection"

export function useConnectionHealth(): ConnectionHealth {
  const { instance, instanceLoading } = useInbox()
  return connectionHealth(instance, instanceLoading)
}

export function ConnectionBadge({ className }: { className?: string }) {
  const health = useConnectionHealth()
  const { instance } = useInbox()
  const [open, setOpen] = React.useState(false)
  const phone = instance?.instance?.phone
  const content = (
    <>
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
    </>
  )
  // Quem administra abre a configuração da conexão por aqui (também com o número conectado).
  if (!instance?.canManage) return <p className={cn("flex items-center gap-1.5 text-[12px] text-muted-foreground", className)}>{content}</p>
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${LABEL[health]} — configurar a conexão`}
        className={cn("flex max-w-full items-center gap-1.5 rounded-[6px] text-left text-[12px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40", className)}
      >
        {content}
      </button>
      <ConnectionDialog open={open} onOpenChange={setOpen} />
    </>
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

/** Conexão do número oficial. Só quem administra o escritório vê os dados e conecta. */
function ConnectionSetup() {
  const { instance: info, reloadInstance } = useInbox()
  const health = useConnectionHealth()

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

  return <MetaConnectionSetup info={info} onChanged={reloadInstance} />
}
