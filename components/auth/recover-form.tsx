"use client"

import * as React from "react"
import Link from "next/link"
import { MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/field"
import { AuthCard, FormError } from "./auth-card"
import { HoneypotField, useAuthChallenge } from "./use-auth-challenge"
import { isEmail } from "@/lib/auth/validation"
import { publicMessage } from "@/lib/core/public-error"

export function RecoverForm() {
  const [email, setEmail] = React.useState("")
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [website, setWebsite] = React.useState("")
  const proof = useAuthChallenge("recover")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isEmail(email.trim())) {
      setError("Informe um e-mail válido.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website, ...(await proof()) }),
      })
      if (!res.ok) {
        const { error: message } = await res.json().catch(() => ({ error: "" }))
        setError(publicMessage(message, "Não foi possível enviar agora. Tente de novo em instantes."))
        return
      }
    } catch (failure) {
      setError(publicMessage(failure, "Não foi possível enviar agora. Tente de novo em instantes."))
      return
    } finally {
      setBusy(false)
    }
    setSent(true)
  }

  const back = (
    <Link href="/login" className="font-medium text-foreground hover:underline">
      Voltar para o login
    </Link>
  )

  if (sent) {
    return (
      <AuthCard
        title="Confira seu e-mail"
        description="Se houver uma conta com este endereço, enviamos um link para redefinir a senha. Ele vale por 1 hora e só pode ser usado uma vez."
        footer={back}
      >
        <div className="flex items-center gap-3 rounded-[12px] bg-surface-muted/60 px-3.5 py-3 text-[13px] text-muted-foreground">
          <MailCheck className="size-4 shrink-0" /> {email}
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Recuperar senha" description="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha." footer={back}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError>{error}</FormError>
        <HoneypotField value={website} onChange={setWebsite} />
        <Field label="E-mail" htmlFor="rec-email">
          <TextInput id="rec-email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy || !email}>
          {busy ? "Enviando…" : "Enviar link"}
        </Button>
      </form>
    </AuthCard>
  )
}
