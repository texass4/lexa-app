"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/field"
import { AuthCard, FormError } from "./auth-card"
import { getSupabase } from "@/lib/supabase/client"
import { normalizeEmail, safeNext } from "@/lib/auth/validation"
import { hardNavigate } from "@/lib/auth/navigate"

export function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState(params.get("erro") === "link" ? "O link expirou ou já foi usado. Peça um novo." : "")
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    const { error: authError } = await getSupabase().auth.signInWithPassword({ email: normalizeEmail(email), password })
    if (authError) {
      setBusy(false)
      setError("E-mail ou senha incorretos.")
      return
    }
    hardNavigate(safeNext(params.get("next")))
  }

  return (
    <AuthCard
      title="Entrar"
      description="Acesse o LEXA do seu escritório."
      footer={
        <>
          Novo por aqui?{" "}
          <Link href="/cadastro" className="font-medium text-foreground hover:underline">
            Cadastre seu escritório
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError>{error}</FormError>
        <Field label="E-mail" htmlFor="login-email">
          <TextInput id="login-email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" htmlFor="login-password">
          <TextInput
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Link href="/recuperar-senha" className="text-[12.5px] text-muted-foreground hover:text-foreground hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </AuthCard>
  )
}
