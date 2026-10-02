"use client"

import * as React from "react"
import { ArrowLeft, Clock3, LogOut, RefreshCw, ShieldCheck, ShieldOff, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthCard } from "@/components/auth/auth-card"
import { useSplashReady } from "@/components/layout/app-splash"
import { getSupabase } from "@/lib/supabase/client"
import { setAccount } from "@/lib/auth/account"
import { hasPermission, type Permission } from "./permissions"
import { toOrganization, toUser, type OrganizationRow, type ProfileRow } from "./profile"
import type { Organization, User } from "@/types"
import { hardNavigate } from "@/lib/auth/navigate"
import { preloadOfficeData } from "@/lib/store/office-store"
import { signOutAndLeave } from "@/lib/auth/sign-out"

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
  | { kind: "blocked"; reason: "user" | "organization" | "suspended" | "no-organization" }
  | { kind: "maintenance"; message: string }
  | { kind: "super-admin" }

const SessionContext = React.createContext<Session | null>(null)

const signOut = () => signOutAndLeave()

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
    // Vindo do botão "CRM" do Admin, explica por que não há CRM para o Super Admin;
    // em qualquer outra entrada (login, link antigo), segue direto para o Admin.
    if (new URLSearchParams(window.location.search).get("de") === "admin") return { kind: "super-admin" }
    hardNavigate("/admin")
    return { kind: "loading" }
  }
  if (!profile.active) return { kind: "blocked", reason: "user" }

  // Escritório, equipe e manutenção dependem só do perfil: buscados em paralelo.
  const [{ data: orgRow }, { data: memberRows }, { data: maintenance }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", profile.organization_id).maybeSingle<OrganizationRow>(),
    supabase.from("profiles").select("*").eq("organization_id", profile.organization_id).order("name"),
    supabase.rpc("platform_maintenance"),
  ])
  if (!orgRow) return { kind: "blocked", reason: "no-organization" }
  const organization = toOrganization(orgRow)
  if (organization.status === "pending") return { kind: "pending", organization }
  if (organization.status === "suspended") return { kind: "blocked", reason: "suspended" }
  if (organization.status !== "active") return { kind: "blocked", reason: "organization" }

  // Manutenção da plataforma: a RLS já bloqueia os dados; aqui só explicamos.
  const platform = maintenance as { enabled?: boolean; message?: string | null } | null
  if (platform?.enabled) return { kind: "maintenance", message: platform.message || "Estamos em manutenção. Voltamos em instantes." }

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

  // A intro fica até a sessão (e, em seguida, os dados) estarem prontos.
  useSplashReady("session", status.kind === "ready")
  // Aguardando aprovação, sem acesso, manutenção…: a tela própria aparece sem esperar dados.
  useSplashReady("app", status.kind !== "loading" && status.kind !== "ready")

  React.useEffect(() => {
    // Os dados do escritório não dependem da sessão carregada (a RLS decide o que
    // volta): começam a carregar junto, em vez de esperar perfil → escritório → equipe.
    preloadOfficeData()
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

  // A intro (`SplashGate`) cobre a tela enquanto a sessão carrega.
  if (status.kind === "loading") return null

  if (status.kind === "pending") {
    return (
      <AuthCard
        title="Aguardando aprovação"
        description={
          <>
            O cadastro de <strong className="font-medium text-foreground">{status.organization?.name ?? "seu escritório"}</strong> foi recebido. Assim
            que a equipe da Íntegra aprovar, você poderá entrar normalmente.
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

  if (status.kind === "super-admin") {
    return (
      <AuthCard
        title="O CRM é de cada escritório"
        description="Você está conectado como Super Admin. Essa conta não pertence a nenhum escritório e, por isso, não abre dados jurídicos de clientes — é o que garante o isolamento entre escritórios."
      >
        <div className="flex items-center gap-3 rounded-[12px] bg-brand-soft/70 px-3.5 py-3 text-[13px] text-brand-strong">
          <ShieldCheck className="size-4 shrink-0" /> Para ver o CRM como um cliente, entre com uma conta de escritório.
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={signOut}>
            <LogOut /> Trocar de conta
          </Button>
          <Button onClick={() => hardNavigate("/admin")}>
            <ArrowLeft /> Voltar ao Admin
          </Button>
        </div>
      </AuthCard>
    )
  }

  if (status.kind === "maintenance") {
    return (
      <AuthCard title="Manutenção programada" description={status.message}>
        <div className="flex items-center gap-3 rounded-[12px] bg-surface-muted/60 px-3.5 py-3 text-[13px] text-muted-foreground">
          <Wrench className="size-4 shrink-0" /> Seus dados estão seguros. Tente de novo em alguns minutos.
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={signOut}>
            <LogOut /> Sair
          </Button>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw /> Tentar de novo
          </Button>
        </div>
      </AuthCard>
    )
  }

  if (status.kind === "blocked") {
    const description = {
      user: "Seu acesso a este escritório foi desativado. Fale com o sócio responsável.",
      organization: "O acesso deste escritório à Íntegra está desativado. Fale com a equipe da Íntegra.",
      suspended: "O acesso deste escritório à Íntegra está suspenso. Fale com a equipe da Íntegra para regularizar.",
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
