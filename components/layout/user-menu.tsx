"use client"

import { useRouter } from "next/navigation"
import { ChevronsUpDown, Keyboard, LogOut, Moon, Settings, Sun, UserRound } from "lucide-react"
import { toast } from "sonner"
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
import { useTheme } from "@/lib/theme"
import { getUser, CURRENT_USER_ID, organization } from "@/lib/account"
import { useUI } from "@/lib/store/ui-store"

export function UserMenu({ variant, compact }: { variant: "sidebar" | "header"; compact?: boolean }) {
  const user = getUser(CURRENT_USER_ID)
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { setCommandOpen } = useUI()

  return (
    <DropdownMenu>
      {variant === "sidebar" ? (
        <DropdownMenuTrigger
          aria-label="Menu do usuário"
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-sidebar-accent",
            compact && "justify-center",
          )}
        >
          <UserAvatar name={user.name} size="md" tone="dark" />
          <span className={cn("min-w-0 flex-1", compact && "sr-only")}>
            <span className="block truncate text-[13px] font-medium text-foreground">{user.name}</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">{user.role}</span>
          </span>
          {!compact && <ChevronsUpDown className="size-3.5 text-subtle" />}
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label="Menu do usuário"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <UserAvatar name={user.name} size="md" tone="dark" />
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
          <DropdownMenuItem
            className="h-8 px-2"
            onClick={() => toast("Você está em um ambiente de demonstração.", { description: "A saída está desativada nesta versão." })}
          >
            <LogOut /> Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
