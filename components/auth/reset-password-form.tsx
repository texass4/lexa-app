"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/field"
import { AuthCard, FormError } from "./auth-card"
import { getSupabase } from "@/lib/supabase/client"
import { MIN_PASSWORD, passwordProblem } from "@/lib/auth/validation"
import { hardNavigate } from "@/lib/auth/navigate"

/** Definir senha: chega aqui pelo link de recuperação ou de convite (já com sessão). */
export function ResetPasswordForm() {
  const invite = useSearchParams().get("convite") === "1"
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const weak = passwordProblem(password)
    if (weak) return setError(weak)
    if (password !== confirm) return setError("As senhas não conferem.")
    setBusy(true)
    setError("")
    const { error: updateError } = await getSupabase().auth.updateUser({ password })
    if (updateError) {
      setBusy(false)
      setError(
        /different/i.test(updateError.message) ? "Escolha uma senha diferente da atual." : "Não foi possível salvar a senha. Peça um novo link.",
      )
      return
    }
    hardNavigate("/")
  }

  return (
    <AuthCard
      title={invite ? "Bem-vindo ao LEXA" : "Nova senha"}
      description={invite ? "Crie a senha que você vai usar para entrar." : "Escolha uma nova senha para a sua conta."}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError>{error}</FormError>
        <Field label="Nova senha" htmlFor="np-password" hint={`Pelo menos ${MIN_PASSWORD} caracteres, com letras e números.`}>
          <TextInput
            id="np-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirme a senha" htmlFor="np-confirm">
          <TextInput id="np-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
          {busy ? "Salvando…" : invite ? "Criar senha e entrar" : "Salvar nova senha"}
        </Button>
      </form>
    </AuthCard>
  )
}
