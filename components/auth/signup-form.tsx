"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/field"
import { AuthCard, FormError } from "./auth-card"
import { getSupabase } from "@/lib/supabase/client"
import { maskDocument } from "@/lib/masks"
import { isEmail, MIN_PASSWORD, normalizeEmail, passwordProblem } from "@/lib/auth/validation"
import { hardNavigate } from "@/lib/auth/navigate"

export function SignupForm() {
  const [form, setForm] = React.useState({ name: "", email: "", password: "", officeName: "", cnpj: "" })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 3) next.name = "Informe seu nome completo."
    if (!isEmail(form.email.trim())) next.email = "E-mail inválido."
    const weak = passwordProblem(form.password)
    if (weak) next.password = weak
    if (form.officeName.trim().length < 2) next.officeName = "Informe o nome do escritório."
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    setError("")
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const { error: message } = await res.json().catch(() => ({ error: "Não foi possível concluir o cadastro." }))
      setBusy(false)
      setError(message)
      return
    }
    await getSupabase().auth.signInWithPassword({ email: normalizeEmail(form.email), password: form.password })
    hardNavigate("/")
  }

  return (
    <AuthCard
      title="Cadastre seu escritório"
      description="Depois do cadastro, a equipe do LEXA aprova o acesso e você já pode convidar sua equipe."
      className="max-w-[440px]"
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError>{error}</FormError>
        <Field label="Nome do escritório" htmlFor="su-office" error={errors.officeName}>
          <TextInput
            id="su-office"
            autoFocus
            value={form.officeName}
            aria-invalid={!!errors.officeName}
            onChange={(e) => set("officeName", e.target.value)}
          />
        </Field>
        <Field label="CNPJ" htmlFor="su-cnpj" optional>
          <TextInput
            id="su-cnpj"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={form.cnpj}
            onChange={(e) => set("cnpj", maskDocument(e.target.value))}
          />
        </Field>
        <Field label="Seu nome completo" htmlFor="su-name" error={errors.name}>
          <TextInput id="su-name" autoComplete="name" value={form.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="E-mail" htmlFor="su-email" error={errors.email}>
          <TextInput
            id="su-email"
            type="email"
            autoComplete="email"
            value={form.email}
            aria-invalid={!!errors.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Senha" htmlFor="su-password" error={errors.password} hint={`Pelo menos ${MIN_PASSWORD} caracteres, com letras e números.`}>
          <TextInput
            id="su-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            aria-invalid={!!errors.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Cadastrando…" : "Cadastrar escritório"}
        </Button>
      </form>
    </AuthCard>
  )
}
