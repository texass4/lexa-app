"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowDown, ArrowUp, Building2, CornerDownLeft, LoaderCircle, Search } from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { UserAvatar } from "@/components/ui/user-avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { adminFetch } from "@/lib/admin/client"
import { ORG_STATUS, type OrgStatus } from "@/lib/admin/catalog"
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions"
import { ADMIN_ITEMS } from "./nav"
import { useAdminShell } from "./admin-context"

const itemCls =
  "group flex cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2 text-[13px] text-foreground outline-none data-[selected=true]:bg-accent"
const groupCls =
  "px-1.5 pb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-subtle"

interface Results {
  organizations: { id: string; name: string; plan: string; status: OrgStatus; cnpj: string | null }[]
  users: { id: string; name: string; email: string; role: Role; organizationId: string; organizationName: string }[]
}

export function AdminSearch() {
  const { searchOpen, setSearchOpen } = useAdminShell()
  return (
    <DialogPrimitive.Root open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#0e1726]/25 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/55" />
        <DialogPrimitive.Popup className="fixed top-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-border bg-popover shadow-float outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 sm:top-[14vh]">
          <DialogPrimitive.Title className="sr-only">Busca do Admin</DialogPrimitive.Title>
          <SearchContent onClose={() => setSearchOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function SearchContent({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<Results>({ organizations: [], users: [] })
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      adminFetch<Results>(`/api/admin/search?q=${encodeURIComponent(q)}`, "GET", undefined, controller.signal)
        .then(setResults)
        .catch(() => undefined)
        .finally(() => !controller.signal.aborted && setLoading(false))
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const go = (href: string) => {
    onClose()
    router.push(href)
  }
  const hasQuery = query.trim().length >= 2
  const shown = hasQuery ? results : { organizations: [], users: [] }

  return (
    <Command label="Busca do Admin" loop shouldFilter={false}>
      <div className="flex items-center gap-3 border-b border-border px-4">
        {loading ? <LoaderCircle className="size-[18px] shrink-0 animate-spin text-subtle" /> : <Search className="size-[18px] shrink-0 text-subtle" />}
        <Command.Input
          value={query}
          onValueChange={setQuery}
          autoFocus
          placeholder="Escritório, CNPJ, pessoa ou e-mail…"
          className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-subtle"
        />
        <Kbd className="hidden sm:inline-flex">Esc</Kbd>
      </div>
      <Command.List className="max-h-[min(60vh,460px)] overflow-y-auto overscroll-contain pb-1.5 thin-scrollbar">
        {hasQuery && !loading && !shown.organizations.length && !shown.users.length && (
          <div className="px-6 py-10 text-center">
            <p className="text-[13.5px] font-medium">Nada encontrado para “{query.trim()}”</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Busque pelo nome do escritório, CNPJ, nome ou e-mail da pessoa.</p>
          </div>
        )}

        {shown.organizations.length > 0 && (
          <Command.Group heading="Escritórios" className={groupCls}>
            {shown.organizations.map((o) => (
              <Command.Item key={o.id} value={`org-${o.id}`} onSelect={() => go(`/admin/escritorios/${o.id}`)} className={itemCls}>
                <span className="flex size-7 items-center justify-center rounded-[8px] border border-border bg-surface text-muted-foreground">
                  <Building2 className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    Plano {o.plan}
                    {o.cnpj && ` · ${o.cnpj}`}
                  </span>
                </span>
                <StatusBadge tone={ORG_STATUS[o.status].tone} size="sm">
                  {ORG_STATUS[o.status].label}
                </StatusBadge>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {shown.users.length > 0 && (
          <Command.Group heading="Usuários" className={groupCls}>
            {shown.users.map((u) => (
              <Command.Item key={u.id} value={`user-${u.id}`} onSelect={() => go(`/admin/usuarios?q=${encodeURIComponent(u.email)}`)} className={itemCls}>
                <UserAvatar name={u.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {u.email} · {u.organizationName}
                  </span>
                </span>
                <span className="hidden text-[11.5px] text-muted-foreground sm:inline">{ROLE_LABELS[u.role]}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Ir para" className={groupCls}>
          {ADMIN_ITEMS.map((item) => (
            <Command.Item key={item.href} value={`nav-${item.href}`} onSelect={() => go(item.href)} className={itemCls}>
              <item.icon className="size-4 text-subtle" />
              <span className="flex-1">{item.label}</span>
              <span className="hidden truncate text-[11.5px] text-subtle sm:inline">{item.description}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <div className="hidden items-center gap-4 border-t border-border bg-surface-muted/40 px-4 py-2.5 text-[11.5px] text-muted-foreground sm:flex">
        <span className="flex items-center gap-1.5">
          <Kbd>
            <ArrowUp className="size-3" />
          </Kbd>
          <Kbd>
            <ArrowDown className="size-3" />
          </Kbd>
          navegar
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft className="size-3" />
          </Kbd>
          abrir
        </span>
        <span className="ml-auto">A busca não inclui dados jurídicos dos escritórios.</span>
      </div>
    </Command>
  )
}
