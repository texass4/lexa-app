"use client"

import * as React from "react"
import { Camera, Check, KeyRound, Mail, Monitor, Moon, Sun, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { Field, TextInput } from "@/components/ui/field"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useTheme } from "@/lib/theme"
import { useSession } from "@/lib/auth/session"
import { userTitle } from "@/lib/account"
import { getSupabase } from "@/lib/supabase/client"
import { maskPhone } from "@/lib/masks"
import { isEmail, MIN_PASSWORD, passwordProblem } from "@/lib/auth/validation"

const AVATAR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
const AVATAR_MAX = 5 * 1024 * 1024

/** Caminho do arquivo no bucket `avatars` a partir da URL pública. */
const avatarPath = (url?: string) => url?.split("/storage/v1/object/public/avatars/")[1]

function PhotoPicker() {
  const { user, refresh } = useSession()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  const save = async (avatarUrl: string | null) => {
    const supabase = getSupabase()
    const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id)
    if (error) throw error
    const old = avatarPath(user.avatarUrl)
    if (old) await supabase.storage.from("avatars").remove([old])
    await refresh()
  }

  const upload = async (file?: File) => {
    if (!file) return
    const ext = AVATAR_TYPES[file.type]
    if (!ext) return toast.error("Use uma imagem PNG, JPG ou WebP.")
    if (file.size > AVATAR_MAX) return toast.error("A foto passa de 5 MB.")
    setBusy(true)
    try {
      const supabase = getSupabase()
      const path = `${user.id}/avatar-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type })
      if (error) throw error
      await save(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl)
      toast.success("Foto atualizada.")
    } catch {
      toast.error("Não foi possível enviar a foto.")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await save(null)
      toast.success("Foto removida.")
    } catch {
      toast.error("Não foi possível remover a foto.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 flex items-center gap-4">
      <UserAvatar name={user.name} src={user.avatarUrl} size="xl" tone="dark" />
      <div>
        <p className="text-[15px] font-semibold">{user.name}</p>
        <p className="text-[13px] text-muted-foreground">
          {userTitle(user)}
          {user.oab && ` · ${user.oab}`}
        </p>
        <div className="mt-2 flex gap-1.5">
          <Button variant="secondary" size="xs" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Camera /> {user.avatarUrl ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {user.avatarUrl && (
            <Button variant="ghost" size="xs" disabled={busy} onClick={remove}>
              <Trash2 /> Remover
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </div>
    </div>
  )
}

function DetailsForm() {
  const { user, refresh } = useSession()
  const [form, setForm] = React.useState({ name: user.name, phone: user.phone, jobTitle: user.jobTitle ?? "", oab: user.oab ?? "" })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const dirty = form.name !== user.name || form.phone !== user.phone || form.jobTitle !== (user.jobTitle ?? "") || form.oab !== (user.oab ?? "")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 3) return setError("Informe o nome completo.")
    setError("")
    setBusy(true)
    const { error: saveError } = await getSupabase()
      .from("profiles")
      .update({ name: form.name.trim(), phone: form.phone || null, job_title: form.jobTitle.trim() || null, oab: form.oab.trim() || null })
      .eq("id", user.id)
    setBusy(false)
    if (saveError) return toast.error("Não foi possível salvar o perfil.")
    await refresh()
    toast.success("Perfil atualizado.")
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field label="Nome completo" htmlFor="p-name" error={error}>
          <TextInput id="p-name" autoComplete="name" value={form.name} aria-invalid={!!error} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Cargo" htmlFor="p-job" optional hint="Ex.: Advogada associada, Estagiário">
          <TextInput id="p-job" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
        </Field>
        <Field label="Telefone" htmlFor="p-phone" optional>
          <TextInput id="p-phone" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} />
        </Field>
        <Field label="Inscrição na OAB" htmlFor="p-oab" optional>
          <TextInput id="p-oab" placeholder="OAB/SC 00.000" value={form.oab} onChange={(e) => set("oab", e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3.5">
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}

function EmailForm() {
  const { user, refresh } = useSession()
  const [email, setEmail] = React.useState(user.email)
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isEmail(email.trim())) return setError("E-mail inválido.")
    if (!password) return setError("Confirme com sua senha atual.")
    setError("")
    setBusy(true)
    const res = await fetch("/api/me/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    setBusy(false)
    if (!res.ok) {
      const { error: message } = await res.json().catch(() => ({ error: "Não foi possível trocar o e-mail." }))
      return setError(message)
    }
    setPassword("")
    await getSupabase().auth.refreshSession()
    await refresh()
    toast.success("E-mail de acesso atualizado.")
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="E-mail de acesso" htmlFor="p-email" error={error}>
        <TextInput id="p-email" type="email" autoComplete="email" value={email} aria-invalid={!!error} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha atual" htmlFor="p-email-pass">
        <TextInput id="p-email-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy || email.trim().toLowerCase() === user.email}>
        <Mail /> {busy ? "Salvando…" : "Trocar e-mail"}
      </Button>
    </form>
  )
}

function PasswordForm() {
  const { user } = useSession()
  const [form, setForm] = React.useState({ current: "", next: "", confirm: "" })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const weak = passwordProblem(form.next)
    if (weak) return setError(weak)
    if (form.next !== form.confirm) return setError("As senhas não conferem.")
    setError("")
    setBusy(true)
    const supabase = getSupabase()
    const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: form.current })
    if (wrong) {
      setBusy(false)
      return setError("Senha atual incorreta.")
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: form.next })
    setBusy(false)
    if (updateError)
      return setError(/different/i.test(updateError.message) ? "A nova senha precisa ser diferente da atual." : "Não foi possível alterar a senha.")
    setForm({ current: "", next: "", confirm: "" })
    toast.success("Senha alterada.")
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Senha atual" htmlFor="pw-current">
          <TextInput
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={form.current}
            onChange={(e) => set("current", e.target.value)}
          />
        </Field>
        <Field label="Nova senha" htmlFor="pw-next" hint={`Mínimo de ${MIN_PASSWORD} caracteres, com letras e números.`}>
          <TextInput id="pw-next" type="password" autoComplete="new-password" value={form.next} onChange={(e) => set("next", e.target.value)} />
        </Field>
        <Field label="Confirme" htmlFor="pw-confirm">
          <TextInput
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => set("confirm", e.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={busy || !form.current || !form.next || !form.confirm}>
          <KeyRound /> {busy ? "Salvando…" : "Alterar senha"}
        </Button>
      </div>
    </form>
  )
}

export function ProfileSection() {
  const { theme, setTheme } = useTheme()
  const [endingOthers, setEndingOthers] = React.useState(false)

  const endOtherSessions = async () => {
    setEndingOthers(true)
    const { error } = await getSupabase().auth.signOut({ scope: "others" })
    setEndingOthers(false)
    if (error) toast.error("Não foi possível encerrar as outras sessões.")
    else toast.success("Sessões em outros dispositivos encerradas.")
  }

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="Perfil" description="Como você aparece para a equipe e para os clientes." />
        <div className="px-5">
          <PhotoPicker />
        </div>
        <DetailsForm />
      </Panel>

      <Panel>
        <PanelHeader title="Acesso" description="E-mail e senha usados para entrar no LEXA." />
        <div className="space-y-6 px-5 pb-5">
          <EmailForm />
          <div className="border-t border-border pt-5">
            <PasswordForm />
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
            <Monitor className="size-4 text-subtle max-sm:hidden" />
            <div className="flex-1">
              <p className="text-[13.5px] font-medium">Outros dispositivos</p>
              <p className="text-[12px] text-muted-foreground">Encerra a sessão em todos os lugares, menos neste navegador.</p>
            </div>
            <Button variant="secondary" size="sm" disabled={endingOthers} onClick={endOtherSessions}>
              Encerrar outras sessões
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Aparência" description="Escolha o tema da interface." />
        <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
          {(
            [
              { id: "light", label: "Claro", icon: Sun, preview: "bg-[#F8F8F6]", bar: "bg-white", line: "bg-[#E7E5E4]" },
              { id: "dark", label: "Escuro", icon: Moon, preview: "bg-[#0E0E0D]", bar: "bg-[#161615]", line: "bg-[#292826]" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={cn(
                "group rounded-[12px] border p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40",
                theme === t.id ? "border-foreground" : "border-border hover:border-border-strong",
              )}
            >
              <div className={cn("flex h-20 gap-1.5 overflow-hidden rounded-[8px] p-2", t.preview)}>
                <div className={cn("w-1/4 rounded-[4px]", t.bar)} />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className={cn("h-3 w-1/2 rounded-[3px]", t.bar)} />
                  <div className={cn("flex-1 rounded-[4px]", t.bar)}>
                    <div className={cn("m-1.5 h-1 w-2/3 rounded", t.line)} />
                    <div className="m-1.5 h-1 w-1/4 rounded bg-[#A88655]" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-1 pt-2">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <t.icon className="size-4 text-muted-foreground" /> {t.label}
                </span>
                {theme === t.id && <Check className="size-4" />}
              </div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}
