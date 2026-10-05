"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { useAuthChallenge } from "./use-auth-challenge"
import { publicMessage } from "@/lib/core/public-error"

/**
 * "Reenviar link de confirmação". A resposta do servidor é sempre a mesma (não diz se
 * há cadastro pendente), então a mensagem também é.
 */
export function ResendConfirmation({ email }: { email: string }) {
  const proof = useAuthChallenge("resend")
  const [state, setState] = React.useState<"idle" | "busy" | "sent" | "error">("idle")
  const [message, setMessage] = React.useState("")

  const resend = async () => {
    setState("busy")
    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...(await proof()) }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }))
        setMessage(publicMessage(error, "Não foi possível reenviar agora. Tente de novo em instantes."))
        setState("error")
        return
      }
      setState("sent")
    } catch (failure) {
      setMessage(publicMessage(failure, "Não foi possível reenviar agora. Tente de novo em instantes."))
      setState("error")
    }
  }

  if (state === "sent") {
    return <p className="text-[12.5px] text-muted-foreground">Se houver um cadastro aguardando confirmação para este e-mail, enviamos um novo link.</p>
  }
  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" className="w-full" onClick={resend} disabled={state === "busy" || !email}>
        {state === "busy" ? "Reenviando…" : "Reenviar link de confirmação"}
      </Button>
      {state === "error" && <p className="text-[12.5px] text-danger">{message}</p>}
    </div>
  )
}
