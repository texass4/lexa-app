"use client"

import * as React from "react"
import { Clock3, LogOut, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthCard } from "@/components/auth/auth-card"
import { LogoMark } from "@/components/layout/logo"
import { getSupabase } from "@/lib/supabase/client"
import { setAccount } from "@/lib/account"
import { hasPermission, type Permission } from "./permissions"
import { toOrganization, toUser, type OrganizationRow, type ProfileRow } from "./profile"
import type { Organization, User } from "@/types"
import { hardNavigate } from "@/lib/auth/navigate"

interface Session {
  user: User
  organization: Organization
  members: User[]
  can(permission: Permission): boolean
  /** Recarrega perfil, escritório e membros (depois de editar o perfil, por exemplo). */
  refresh(): Promise<void>
  signOut(): Promise<void>
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; user: User; organization: Organization; members: User[] }
  | { kind: "pending"; organization?: Organization }
  | { kind: "blocked"; reason: "user" | "organization" | "no-organization" }

const SessionContext = React.createContext<Session | null>(null)

async function signOut() {
  await getSupabase().auth.signOut()
  hardNavigate("/login")
}

async function loadSession(): Promise<Status> {
  const supabase = getSupabase()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) {
    hardNavigate("/login")
    return { kind: "loading" }
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle<ProfileRow>()
  if (!profile) return { kind: "blocked", reason: "no-organization" }
  if (profile.role === "super_admin") {
    hardNavigate("/admin")
    return { kind: "loading" }
  }
  if (!profile.active) return { kind: "blocked", reason: "user" }

  const { data: orgRow } = await supabase.from("organizations").select("*").eq("id", profile.organization_id).maybeSingle<OrganizationRow>()
  if (!orgRow) return { kind: "blocked", reason: "no-organization" }
  const organization = toOrganization(orgRow)
  if (organization.status === "pending") return { kind: "pending", organization }
  if (organization.status === "inactive") return { kind: "blocked", reason: "organization" }

  const { data: memberRows } = await supabase.from("profiles").select("*").eq("organization_id", organization.id).order("name")
  const members = ((memberRows ?? []) as ProfileRow[]).map(toUser)
  const user = toUser(profile)
  return { kind: "ready", user, organization, members: members.some((m) => m.id === user.id) ? members : [user, ...members] }
}

/**
 * Carrega a conta logada e só então renderiza o app. Escritório aguardando aprovação
 * ou acesso desativado mostram uma tela própria. A autorização de verdade está na RLS
 * do banco; isto só decide o que a interface mostra.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>({ kind: "loading" })

  const refresh = React.useCallback(async () => {
    const next = await loadSession()
    if (next.kind === "ready") setAccount({ user: next.user, organization: next.organization, members: next.members })
    setStatus(next)
  }, [])

  React.useEffect(() => {
    // Carga inicial assíncrona da sessão (sistema externo: Supabase).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") hardNavigate("/login")
    })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  const session = React.useMemo<Session | null>(() => {
    if (status.kind !== "ready") return null
    return {
      user: status.user,
      organization: status.organization,
      members: status.members,
      can: (permission) => hasPermission(status.user, permission),
      refresh,
      signOut,
    }
  }, [status, refresh])

  if (status.kind === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="Carregando sua conta">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    )
  }

  if (status.kind === "pending") {
    return (
      <AuthCard
        title="Aguardando aprovação"
        description={
          <>
            O cadastro de <strong className="font-medium text-foreground">{status.organization?.name ?? "seu escritório"}</strong> foi recebido. Assim
            que a equipe do LEXA aprovar, você poderá entrar normalmente.
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-[12px] bg-surface-muted/60 px-3.5 py-3 text-[13px] text-muted-foreground">
          <Clock3 className="size-4 shrink-0" /> Você pode fechar esta página e voltar depois.
        </div>
        <Button variant="secondary" className="mt-5 w-full" onClick={signOut}>
          <LogOut /> Sair
        </Button>
      </AuthCard>
    )
  }

  if (status.kind === "blocked") {
    const description = {
      user: "Seu acesso a este escritório foi desativado. Fale com o sócio responsável.",
      organization: "O acesso deste escritório ao LEXA está desativado. Fale com a equipe do LEXA.",
      "no-organization": "Sua conta não está vinculada a nenhum escritório.",
    }[status.reason]
    return (
      <AuthCard title="Acesso desativado" description={description}>
        <div className="flex items-center gap-3 rounded-[12px] bg-danger-soft/60 px-3.5 py-3 text-[13px] text-danger">
          <ShieldOff className="size-4 shrink-0" /> Nenhum dado do escritório está disponível.
        </div>
        <Button variant="secondary" className="mt-5 w-full" onClick={signOut}>
          <LogOut /> Sair
        </Button>
      </AuthCard>
    )
  }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = React.useContext(SessionContext)
  if (!ctx) throw new Error("useSession deve ser usado dentro de SessionProvider")
  return ctx
}

/** Renderiza o conteúdo só para quem tem a permissão (esconde botões de criar/editar/excluir). */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: React.ReactNode; fallback?: React.ReactNode }) {
  return useSession().can(permission) ? children : fallback
}
