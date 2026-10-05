"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarPlus,
  CornerDownLeft,
  FileText,
  ListChecks,
  Scale,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { UserAvatar } from "@/components/ui/user-avatar"
import { StatusBadge } from "@/components/ui/status-badge"
import { visibleSections } from "./nav-config"
import { DIALOG_PERMISSION, useUI } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"
import { useOfficeData } from "@/lib/store/office-store"
import { useDebounced, usePagedHistory } from "@/lib/store/on-demand"
import { documentSearch, NO_WINDOW } from "@/lib/store/history-lists"
import { byId } from "@/lib/store/indexes"
import { searchFilter } from "@/lib/store/storage"

/** Resultados por grupo na busca global. */
const RESULTS_PER_GROUP = 8
import { normalize } from "@/lib/core/format"
import { CLIENT_STATUS, PROCESS_STATUS } from "@/lib/core/config"
import { fmtShortDate, fmtTime, getNow, parse } from "@/lib/core/dates"
import { officeSignals } from "@/lib/dashboard/attention"
import { SignalDot } from "@/components/shared/signal-list"
import { useLexaAI } from "@/components/ai/lexa-ai-provider"

const itemCls =
  "group flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2 text-[13px] text-foreground outline-none data-[selected=true]:bg-accent"

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
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#0e1726]/25 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/55" />
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
  const data = useOfficeData()
  const { can, user } = useSession()
  const lexa = useLexaAI()
  const router = useRouter()
  const [query, setQuery] = React.useState("")

  const go = (href: string) => {
    setCommandOpen(false)
    router.push(href)
  }

  const hasQuery = query.trim().length > 0
  // Milhares de registros: filtra antes de desenhar (a mesma regra da busca da lista)
  // e mostra os primeiros de cada grupo — a lista não monta um item por registro.
  const search = React.useDeferredValue(query)
  const terms = normalize(search.trim()).split(/\s+/).filter(Boolean)
  const hit = (...fields: (string | undefined)[]) => {
    const hay = normalize(fields.filter(Boolean).join(" "))
    return terms.every((term) => hay.includes(term))
  }
  const first = <T,>(list: readonly T[], test: (item: T) => boolean) => {
    const found: T[] = []
    for (const item of list) {
      if (test(item)) found.push(item)
      if (found.length === RESULTS_PER_GROUP) break
    }
    return found
  }
  // Documentos antigos não vêm na abertura: a busca procura também no banco quando a pessoa para de digitar.
  const term = useDebounced(query.trim())
  const documentList = React.useMemo(() => {
    const filter = can("documents.view") ? searchFilter(term) : null
    return filter ? documentSearch(term, filter, null, undefined, RESULTS_PER_GROUP) : null
  }, [term, can])
  usePagedHistory(documentList, NO_WINDOW, { auto: true })
  const clients = hasQuery
    ? first(data.clients, (c) => hit(`cliente ${c.id} ${c.name}`, c.area, c.email, c.document, c.phone))
    : data.clients.slice(0, 3)
  const processes = hasQuery
    ? first(data.processes, (p) => hit(`processo ${p.id} ${p.number} ${p.code}`, byId(data.clients, p.clientId)?.name, p.type, p.area))
    : data.processes.slice(0, 2)
  const tasks =
    hasQuery && can("tasks.view") ? first(data.tasks, (t) => t.status === "pendente" && hit(`tarefa ${t.id} ${t.title}`, t.description)) : []
  const documents =
    hasQuery && can("documents.view")
      ? first(data.documents, (d) => {
          const process = byId(data.processes, d.processId)
          return hit(`documento ${d.id} ${d.name}`, d.kind, byId(data.clients, d.clientId)?.name, process?.code, process?.number)
        })
      : []
  const appointments =
    hasQuery && can("agenda.view")
      ? first(
          data.appointments,
          (a) => parse(a.end) >= getNow() && hit(`compromisso ${a.id} ${a.title}`, a.personName, a.location, byId(data.clients, a.clientId)?.name),
        )
      : []
  // Sem busca: o que merece atenção agora (os mesmos sinais do painel), no máximo três.
  const attention =
    !hasQuery && data.hydrated
      ? officeSignals(data, { userId: user.id, can })
          .filter((s) => s.level !== "info")
          .slice(0, 3)
      : []

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
          placeholder="Buscar no escritório ou perguntar à Íntegra…"
          className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-subtle"
        />
        <Kbd className="hidden sm:inline-flex">Esc</Kbd>
      </div>

      <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain pb-1.5 thin-scrollbar">
        <Command.Empty className="px-6 py-12 text-center">
          <p className="text-[13.5px] font-medium">Nenhum resultado para “{query}”</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Tente pelo nome, número do processo, tipo de documento ou área.</p>
        </Command.Empty>

        {hasQuery && (
          <Command.Group heading="Conversa" className={groupCls} forceMount>
            <Command.Item
              value={`perguntar integra ${query}`}
              forceMount
              onSelect={() => {
                setCommandOpen(false)
                lexa.ask(query.trim(), lexa.context)
              }}
              className={itemCls}
            >
              <span className="flex size-7 items-center justify-center rounded-[8px] border border-brand/25 bg-brand-soft text-brand-strong">
                <Sparkles className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                Perguntar à Íntegra: <span className="font-medium">“{query.trim()}”</span>
              </span>
              <span className="hidden text-[11.5px] text-subtle sm:inline">{lexa.context.subtitle}</span>
            </Command.Item>
          </Command.Group>
        )}

        {attention.length > 0 && (
          <Command.Group heading="Merece atenção" className={groupCls}>
            {attention.map((signal) => (
              <Command.Item key={signal.id} value={`atencao ${signal.id} ${signal.title}`} onSelect={() => go(signal.href)} className={itemCls}>
                <span className="flex size-7 items-center justify-center">
                  <SignalDot level={signal.level} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{signal.title}</span>
                  {signal.detail && <span className="block truncate text-[11.5px] text-muted-foreground">{signal.detail}</span>}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

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
            <Command.Item
              value="acao perguntar a integra ia conversa"
              onSelect={() => {
                setCommandOpen(false)
                lexa.open()
              }}
              className={itemCls}
            >
              <span className="flex size-7 items-center justify-center rounded-[8px] border border-brand/25 bg-brand-soft text-brand-strong">
                <Sparkles className="size-3.5" />
              </span>
              Perguntar à Íntegra
              <span className="ml-auto hidden text-[11.5px] text-subtle sm:inline">{lexa.context.subtitle}</span>
            </Command.Item>
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
              const client = byId(data.clients, p.clientId)
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

        {documents.length > 0 && (
          <Command.Group heading="Documentos" className={groupCls}>
            {documents.map((d) => {
              const client = byId(data.clients, d.clientId)
              const process = byId(data.processes, d.processId)
              return (
                <Command.Item
                  key={d.id}
                  value={`documento ${d.id} ${d.name}`}
                  keywords={[d.kind, client?.name ?? "", process?.code ?? "", process?.number ?? ""]}
                  onSelect={() => {
                    setCommandOpen(false)
                    openDialog("document-preview", { documentId: d.id })
                  }}
                  className={itemCls}
                >
                  <span className="flex size-6 items-center justify-center rounded-[7px] bg-surface-muted text-muted-foreground">
                    <FileText className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{d.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {[d.kind, client?.name, process && `Processo ${process.code}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Command.Item>
              )
            })}
          </Command.Group>
        )}

        {appointments.length > 0 && (
          <Command.Group heading="Compromissos" className={groupCls}>
            {appointments.map((a) => (
              <Command.Item
                key={a.id}
                value={`compromisso ${a.id} ${a.title}`}
                keywords={[a.personName ?? "", a.location ?? "", byId(data.clients, a.clientId)?.name ?? ""]}
                onSelect={() => go(a.processId ? `/processos/${a.processId}` : a.clientId ? `/clientes/${a.clientId}` : "/agenda")}
                className={itemCls}
              >
                <span className="flex size-6 items-center justify-center rounded-[7px] bg-surface-muted text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <span className="tabular text-[11.5px] text-subtle">
                  {fmtShortDate(a.start)} · {fmtTime(a.start)}
                </span>
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
