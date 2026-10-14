"use client"

/**
 * Conexão do número oficial do WhatsApp (Cloud API da Meta) — para quem administra o
 * escritório. Os três dados vêm do painel da Meta da empresa do escritório; o token
 * vai para o servidor, que valida na Meta antes de salvar, e nunca volta para a tela.
 *
 * Os nomes "WABA ID", "Phone Number ID" e "token de acesso" são os que a Meta usa no
 * painel dela — quem configura precisa encontrá-los lá (exceção à regra de texto das telas).
 */

import * as React from "react"
import { CircleCheck, KeyRound, RefreshCw, TriangleAlert, Unplug } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field, TextInput } from "@/components/ui/field"
import { whatsappApi, type InstanceInfo } from "@/lib/whatsapp/client"
import { CHECK_FAILED } from "@/lib/whatsapp/connection"
import { formatPhone } from "@/lib/whatsapp/phone"
import { publicMessage } from "@/lib/core/public-error"
import { fmtRelative } from "@/lib/core/dates"

const QUALITY: Record<string, { label: string; tone: string }> = {
  GREEN: { label: "Qualidade alta", tone: "text-success" },
  YELLOW: { label: "Qualidade média", tone: "text-warning" },
  RED: { label: "Qualidade baixa", tone: "text-danger" },
}

export function MetaConnectionSetup({ info, onChanged }: { info: InstanceInfo; onChanged: () => Promise<void> }) {
  const instance = info.instance?.provider === "meta" ? info.instance : null
  const [waba, setWaba] = React.useState(instance?.businessAccountId ?? "")
  const [phoneId, setPhoneId] = React.useState(instance?.externalId ?? "")
  const [token, setToken] = React.useState("")
  const [busy, setBusy] = React.useState<"save" | "check" | "disconnect" | null>(null)
  const [error, setError] = React.useState<string>()
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false)

  if (!info.meta.platformReady) {
    return (
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        O WhatsApp oficial ainda não foi habilitado na Íntegra. Fale com o suporte da Íntegra para liberar a conexão do número do escritório.
      </p>
    )
  }

  const connected = instance?.status === "connected" && info.meta.hasToken
  const failing = instance?.status === "error" || !!info.live?.error
  const sameNumber = !!instance && instance.externalId === phoneId.trim()
  const needsToken = !(sameNumber && info.meta.hasToken)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    if (needsToken && !token.trim()) return setError("Informe o token de acesso.")
    setBusy("save")
    try {
      await whatsappApi.connectMeta({ businessAccountId: waba.trim(), phoneNumberId: phoneId.trim(), ...(token.trim() ? { accessToken: token.trim() } : {}) })
      setToken("")
      toast.success("WhatsApp oficial conectado.", { description: "A Meta confirmou o número. Mensagens novas passam a chegar aqui." })
      await onChanged()
    } catch (err) {
      setError(publicMessage(err, "Não foi possível conectar o número. Confira os dados e tente de novo."))
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  const check = async () => {
    setBusy("check")
    try {
      await whatsappApi.instance(true)
      await onChanged()
    } catch (err) {
      toast.error(publicMessage(err, CHECK_FAILED))
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setConfirmDisconnect(false)
    setBusy("disconnect")
    try {
      await whatsappApi.disconnectMeta()
      toast.success("WhatsApp desconectado.", { description: "As conversas ficam guardadas. Para voltar a enviar, conecte de novo." })
      await onChanged()
    } catch (err) {
      toast.error(publicMessage(err, "Não foi possível desconectar. Tente novamente."))
    } finally {
      setBusy(null)
    }
  }

  const quality = instance?.qualityRating ? QUALITY[instance.qualityRating] : undefined

  return (
    <div className="space-y-5 text-[13.5px]">
      <section
        aria-live="polite"
        className={cn(
          "flex items-start gap-3 rounded-[12px] border px-3.5 py-3",
          connected ? "border-success/25 bg-success-soft/50" : failing ? "border-danger/25 bg-danger-soft/50" : "border-border bg-surface-muted/50",
        )}
      >
        {connected ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", failing ? "text-danger" : "text-subtle")} />}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium text-foreground">
            {connected ? "Conectado" : failing ? "Conexão com erro" : instance ? "Desconectado" : "Nenhum número conectado"}
            {instance?.phone ? ` · ${formatPhone(instance.phone)}` : ""}
          </p>
          {connected && (
            <p className="text-[12.5px] text-muted-foreground">
              {instance?.verifiedName ? `${instance.verifiedName} · ` : ""}
              {quality ? <span className={quality.tone}>{quality.label}</span> : null}
              {instance?.lastCheckedAt ? `${quality ? " · " : ""}verificado ${fmtRelative(instance.lastCheckedAt)}` : ""}
            </p>
          )}
          {failing && <p className="text-[12.5px] text-danger">{publicMessage(info.live?.error ?? instance?.statusDetail, CHECK_FAILED)}</p>}
          {!instance && <p className="text-[12.5px] text-muted-foreground">Use o número do WhatsApp Business do escritório, cadastrado na Meta.</p>}
        </div>
        {instance && info.meta.hasToken && (
          <Button variant="ghost" size="xs" onClick={check} disabled={busy !== null} aria-label="Verificar a conexão agora">
            <RefreshCw className={cn(busy === "check" && "animate-spin")} /> Verificar
          </Button>
        )}
      </section>

      <form onSubmit={save} className="space-y-3.5" noValidate>
        <Field label="WABA ID (conta do WhatsApp Business)" htmlFor="meta-waba" hint="No painel da Meta: WhatsApp › Configuração da API.">
          <TextInput id="meta-waba" inputMode="numeric" autoComplete="off" className="font-mono" value={waba} onChange={(e) => setWaba(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Phone Number ID (identificador do número)" htmlFor="meta-phone" hint="Não é o número de telefone: é o identificador que a Meta mostra ao lado dele.">
          <TextInput id="meta-phone" inputMode="numeric" autoComplete="off" className="font-mono" value={phoneId} onChange={(e) => setPhoneId(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field
          label="Token de acesso permanente"
          htmlFor="meta-token"
          hint={
            needsToken
              ? "Gerado para um usuário do sistema da empresa, com as permissões de mensagens e de gestão do WhatsApp Business."
              : "Já há um token salvo. Deixe em branco para manter ou cole um novo para trocar."
          }
        >
          <div className="relative">
            <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <TextInput
              id="meta-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="pl-9 font-mono"
              placeholder={needsToken ? "" : "•••••••• (salvo)"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </Field>

        {error && (
          <p role="alert" className="rounded-[10px] border border-danger/20 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={busy !== null || !waba || !phoneId}>
            {busy === "save" ? "Validando na Meta…" : instance ? "Salvar e validar" : "Conectar e validar"}
          </Button>
          {instance && info.meta.hasToken && (
            <Button type="button" variant="ghost" size="sm" className="text-danger hover:text-danger" disabled={busy !== null} onClick={() => setConfirmDisconnect(true)}>
              <Unplug /> Desconectar
            </Button>
          )}
        </div>
        <p className="text-[12px] leading-relaxed text-subtle">
          A Íntegra só marca como conectado depois de a Meta confirmar o número e o acesso. O token fica guardado com criptografia e não aparece de novo nesta tela.
        </p>
      </form>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Desconectar o WhatsApp oficial?"
        description="O token é apagado e a Íntegra para de enviar e receber mensagens por este número. As conversas e o histórico continuam guardados."
        confirmLabel="Desconectar"
        onConfirm={disconnect}
      />
    </div>
  )
}
