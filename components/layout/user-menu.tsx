"use client"

import { useRouter } from "next/navigation"
import { ChevronDown, ChevronsUpDown, Keyboard, LogOut, Moon, Settings, Sun, UserRound } from "lucide-react"
import { cn } from "cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useTheme } from "@/lib/core/theme"
import { userTitle } from "@/lib/auth/account"
import { useSession } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"

export function UserMenu({ variant, compact }: { variant: "sidebar" | "header"; compact?: boolean }) {
  const { user, organization, signOut } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { setCommandOpen } = useUI()

  return (
    <DropdownMenu>
      {variant === "sidebar" ? (
        <DropdownMenuTrigger
          aria-label="Menu do usuário"
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-[12px] p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring/60 aria-expanded:bg-sidebar-accent",
            compact && "justify-center",
          )}
        >
          <UserAvatar name={user.name} src={user.avatarUrl} size="md" tone="gold" />
          <span className={cn("min-w-0 flex-1", compact && "sr-only")}>
            <span className="block truncate text-[13px] font-medium text-sidebar-foreground">{user.name}</span>
            <span className="block truncate text-[11.5px] text-sidebar-muted">{userTitle(user)}</span>
          </span>
          {!compact && <ChevronsUpDown className="size-3.5 text-sidebar-muted" />}
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label="Menu do usuário"
          className="group flex items-center gap-2.5 rounded-[12px] p-1 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/45 aria-expanded:bg-accent xl:pr-2.5"
        >
          <UserAvatar name={user.name} src={user.avatarUrl} size="lg" tone="dark" />
          <span className="hidden min-w-0 max-w-[160px] xl:block">
            <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">{user.name}</span>
            <span className="block truncate text-[11.5px] leading-tight text-muted-foreground">{userTitle(user)}</span>
          </span>
          <ChevronDown className="hidden size-4 text-subtle transition-transform group-aria-expanded:rotate-180 xl:block" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        side={variant === "sidebar" ? "top" : "bottom"}
        align={variant === "sidebar" ? "start" : "end"}
        sideOffset={8}
        className="w-60 rounded-[12px] p-1.5"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block text-[13px] font-medium text-foreground">{user.name}</span>
            <span className="block text-[11.5px] font-normal text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="h-8 px-2" onClick={() => router.push("/configuracoes?secao=perfil")}>
            <UserRound /> Meu perfil
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => router.push("/configuracoes")}>
            <Settings /> Configurações
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "dark" ? "Tema claro" : "Tema escuro"}
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => setCommandOpen(true)}>
            <Keyboard /> Busca rápida
            <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal">
            {organization.name} · Plano {organization.plan}
          </DropdownMenuLabel>
          <DropdownMenuItem className="h-8 px-2" onClick={signOut}>
            <LogOut /> Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
