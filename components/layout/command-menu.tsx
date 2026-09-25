"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowDown, ArrowUp, CalendarPlus, CornerDownLeft, ListChecks, Scale, Search, UsersRound } from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { UserAvatar } from "@/components/ui/user-avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { visibleSections } from "./nav-config"
import { DIALOG_PERMISSION, useUI } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"
import { useDemoData } from "@/lib/store/demo-store"
import { normalize } from "@/lib/format"
import { CLIENT_STATUS, PROCESS_STATUS } from "@/lib/config"
import { fmtShortDate } from "@/lib/dates"

const itemCls =
  "group flex cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2 text-[13px] text-foreground outline-none data-[selected=true]:bg-accent"

const groupCls =
  "px-1.5 pb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-subtle"

export function CommandMenu() {
  const { commandOpen, setCommandOpen, toggleSidebar } = useUI()

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setCommandOpen(!commandOpen)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [commandOpen, setCommandOpen, toggleSidebar])

  return (
    <DialogPrimitive.Root open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#171717]/25 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/55" />
        <DialogPrimitive.Popup className="fixed top-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-border bg-popover shadow-float outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 sm:top-[14vh]">
          <DialogPrimitive.Title className="sr-only">Busca global</DialogPrimitive.Title>
          <CommandContent />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CommandContent() {
  const { setCommandOpen, openDialog } = useUI()
  const data = useDemoData()
  const { can } = useSession()
  const router = useRouter()
  const [query, setQuery] = React.useState("")

  const go = (href: string) => {
    setCommandOpen(false)
    router.push(href)
  }

  const hasQuery = query.trim().length > 0
  const clients = hasQuery ? data.clients : data.clients.slice(0, 3)
  const processes = hasQuery ? data.processes : data.processes.slice(0, 2)
  const tasks = hasQuery ? data.tasks.filter((t) => t.status === "pendente") : []

  return (
    <Command
      label="Busca global"
      loop
      filter={(value, search, keywords) => {
        const hay = normalize(`${value} ${(keywords ?? []).join(" ")}`)
        return normalize(search)
          .split(/\s+/)
          .every((term) => hay.includes(term))
          ? 1
          : 0
      }}
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-[18px] shrink-0 text-subtle" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          autoFocus
          placeholder="Buscar clientes, processos ou tarefas…"
          className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-subtle"
        />
        <Kbd className="hidden sm:inline-flex">Esc</Kbd>
      </div>

      <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain pb-1.5 thin-scrollbar">
        <Command.Empty className="px-6 py-12 text-center">
          <p className="text-[13.5px] font-medium">Nenhum resultado para “{query}”</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Tente buscar pelo nome, número do processo ou área.</p>
        </Command.Empty>

        {!hasQuery && (
          <Command.Group heading="Ações rápidas" className={groupCls}>
            {[
              { label: "Novo processo", icon: Scale, kind: "process" as const },
              { label: "Nova tarefa", icon: ListChecks, kind: "task" as const },
              {
                label: "Novo compromisso",
                icon: CalendarPlus,
                kind: "appointment" as const,
              },
            ]
              .filter((a) => can(DIALOG_PERMISSION[a.kind]))
              .map((a) => (
                <Command.Item key={a.kind} value={`acao ${a.label}`} onSelect={() => openDialog(a.kind)} className={itemCls}>
                  <span className="flex size-7 items-center justify-center rounded-[8px] border border-border bg-surface text-muted-foreground">
                    <a.icon className="size-3.5" />
                  </span>
                  {a.label}
                </Command.Item>
              ))}
          </Command.Group>
        )}

        {clients.length > 0 && (
          <Command.Group heading="Clientes" className={groupCls}>
            {clients.map((c) => (
              <Command.Item
                key={c.id}
                value={`cliente ${c.id} ${c.name}`}
                keywords={[c.area, c.email, c.document, c.phone]}
                onSelect={() => go(`/clientes/${c.id}`)}
                className={itemCls}
              >
                <UserAvatar name={c.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="hidden text-[12px] text-muted-foreground sm:inline">{c.area}</span>
                <StatusBadge tone={CLIENT_STATUS[c.status].tone} size="sm">
                  {CLIENT_STATUS[c.status].label}
                </StatusBadge>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {processes.length > 0 && (
          <Command.Group heading="Processos" className={groupCls}>
            {processes.map((p) => {
              const client = data.clients.find((c) => c.id === p.clientId)
              return (
                <Command.Item
                  key={p.id}
                  value={`processo ${p.id} ${p.number} ${p.code}`}
                  keywords={[client?.name ?? "", p.type, p.area]}
                  onSelect={() => go(`/processos/${p.id}`)}
                  className={itemCls}
                >
                  <span className="flex size-6 items-center justify-center rounded-[7px] bg-surface-muted text-muted-foreground">
                    <Scale className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12.5px]">{p.number}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {client?.name} · {p.type}
                    </span>
                  </span>
                  <span className="hidden sm:inline">
                    <StatusBadge tone={PROCESS_STATUS[p.status].tone} size="sm">
                      {PROCESS_STATUS[p.status].label}
                    </StatusBadge>
                  </span>
                </Command.Item>
              )
            })}
          </Command.Group>
        )}

        {tasks.length > 0 && (
          <Command.Group heading="Tarefas" className={groupCls}>
            {tasks.map((t) => (
              <Command.Item
                key={t.id}
                value={`tarefa ${t.id} ${t.title}`}
                keywords={[t.description ?? ""]}
                onSelect={() => go(`/tarefas?tarefa=${t.id}`)}
                className={itemCls}
              >
                <span className="flex size-6 items-center justify-center rounded-[6px] border border-border-strong text-subtle">
                  <ListChecks className="size-3" />
                </span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="tabular text-[11.5px] text-subtle">{fmtShortDate(t.dueAt)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Ir para" className={groupCls}>
          {visibleSections(can)
            .flatMap((s) => s.items)
            .map((item) => (
              <Command.Item key={item.href} value={`ir para ${item.label}`} onSelect={() => go(item.href)} className={itemCls}>
                <item.icon className="size-4 text-subtle" />
                {item.label}
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
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd>
          fechar
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <UsersRound className="size-3.5" /> {data.clients.length} clientes · {data.processes.length} processos
        </span>
      </div>
    </Command>
  )
}
