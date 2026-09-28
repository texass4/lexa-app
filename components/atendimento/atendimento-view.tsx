"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { SideSheet } from "@/components/ui/side-sheet"
import { UnderlineTabs } from "@/components/ui/underline-tabs"
import { fetchConversation } from "@/lib/whatsapp/client"
import type { WhatsAppConversation } from "@/types"
import { InboxProvider, useInbox } from "./inbox-provider"
import { ConversationList, type InboxFilter } from "./conversation-list"
import { ConversationView, EmptyConversation } from "./conversation-view"
import { ContextPanel } from "./context-panel"
import { AiPanel } from "./ai-panel"
import { AssignDialog, NewConversationDialog } from "./dialogs"

type PanelTab = "context" | "ai"

const WIDE = "(min-width: 1280px)"

function useMediaQuery(query: string) {
  return React.useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", cb)
      return () => mql.removeEventListener("change", cb)
    },
    () => window.matchMedia(query).matches,
    () => true,
  )
}

/**
 * Central de Atendimento: Conversas → Conversa → Contexto jurídico.
 * A conversa aberta fica na URL (`?c=<id>`), para compartilhar e voltar com o navegador.
 */
export function AtendimentoView() {
  return (
    <InboxProvider>
      <Workspace />
    </InboxProvider>
  )
}

function Workspace() {
  const { conversations, upsertConversation, status } = useInbox()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const wide = useMediaQuery(WIDE)
  const selectedId = params.get("c") ?? undefined
  const [filter, setFilter] = React.useState<InboxFilter>("all")
  const [panel, setPanel] = React.useState<PanelTab | null>("context")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [newOpen, setNewOpen] = React.useState(false)
  const selected = conversations.find((c) => c.id === selectedId)

  const select = React.useCallback(
    (id?: string) => router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false }),
    [router, pathname],
  )

  // Link direto para uma conversa que ainda não está na lista (ex.: mais antiga que a página).
  React.useEffect(() => {
    if (!selectedId || selected || status !== "ready") return
    let cancelled = false
    fetchConversation(selectedId).then((c) => {
      if (cancelled) return
      if (c) upsertConversation(c)
      else select(undefined)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId, selected, status, upsertConversation, select])

  const showPanel = (tab: PanelTab) => {
    if (wide) setPanel((current) => (current === tab ? null : tab))
    else {
      setPanel(tab)
      setSheetOpen(true)
    }
  }

  const onChanged = (c: WhatsAppConversation) => upsertConversation(c)
  const activeTab: PanelTab = panel ?? "context"

  const panelBody = selected && (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4">
        <UnderlineTabs
          ariaLabel="Painel da conversa"
          layoutId={wide ? "panel-tab" : "panel-tab-sheet"}
          value={activeTab}
          onChange={(v) => setPanel(v)}
          tabs={[
            { value: "context", label: "Contexto" },
            { value: "ai", label: "Lexa IA" },
          ]}
          className="mx-0 flex-1 border-b-0 px-0"
        />
        {wide && (
          <Button variant="ghost" size="icon-xs" aria-label="Fechar painel" onClick={() => setPanel(null)}>
            <X />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 border-t border-border">
        {activeTab === "context" ? (
          <ContextPanel conversation={selected} onChanged={onChanged} onChangeAssignee={() => setAssignOpen(true)} />
        ) : (
          <AiPanel conversation={selected} onUseReply={() => !wide && setSheetOpen(false)} />
        )}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-[16px] border border-border bg-card shadow-card">
      <aside
        aria-label="Caixa de entrada"
        className={cn("flex min-h-0 w-full shrink-0 flex-col border-border md:w-[300px] md:border-r xl:w-[320px]", selected && "max-md:hidden")}
      >
        <ConversationList selectedId={selectedId} onSelect={select} onNew={() => setNewOpen(true)} filter={filter} onFilterChange={setFilter} />
      </aside>

      <section aria-label="Conversa" className={cn("flex min-w-0 flex-1 flex-col", !selected && "max-md:hidden")}>
        {selected ? (
          <ConversationView
            key={selected.id}
            conversation={selected}
            onBack={() => select(undefined)}
            onAssign={() => setAssignOpen(true)}
            onShowContext={() => showPanel("context")}
            onShowAi={() => showPanel("ai")}
            panel={wide ? panel : sheetOpen ? panel : null}
          />
        ) : (
          <EmptyConversation />
        )}
      </section>

      {wide && selected && panel && (
        <aside aria-label="Contexto do atendimento" className="flex min-h-0 w-[320px] shrink-0 flex-col border-l border-border pt-1 2xl:w-[340px]">
          {panelBody}
        </aside>
      )}

      {!wide && selected && (
        <SideSheet open={sheetOpen} onOpenChange={setSheetOpen} title="Contexto do atendimento" className="sm:w-[400px]">
          <div className="h-full pt-2">{panelBody}</div>
        </SideSheet>
      )}

      {selected && <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} conversation={selected} onChanged={onChanged} />}
      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(c) => {
          upsertConversation(c)
          select(c.id)
        }}
      />
    </div>
  )
}
