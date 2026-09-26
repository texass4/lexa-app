"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import type { AISource, AIStatus } from "@/lib/ai/types"
import { useDemoData } from "@/lib/store/demo-store"
import { useSession } from "@/lib/auth/session"
import { isAIReady, type SourceHandler } from "./ai-blocks"
import { AIChatSheet } from "./ai-chat-sheet"
import { clientContext, officeContext, processContext, scopeKey, type AIContext } from "./ai-context"
import { useAIChat, useAIStatus } from "./use-ai"

/**
 * A LEXA IA como camada do produto, não como página: um único painel lateral,
 * disponível em qualquer tela, que já sabe onde a pessoa está (escritório,
 * processo ou cliente) e oferece as perguntas daquele contexto.
 *
 * Nada é chamado sozinho: abrir o painel não consulta o modelo; só enviar uma
 * pergunta consulta. A conversa pertence ao contexto — trocar de processo
 * começa outra, sem misturar dados.
 */

interface LexaAIValue {
  status: AIStatus | null
  ready: boolean
  /** Contexto em vigor (o da tela, ou o que uma ação pediu). */
  context: AIContext
  isOpen: boolean
  open(context?: AIContext): void
  /** Abre o painel e envia a pergunta — sempre a partir de um clique. */
  ask(prompt: string, context?: AIContext): void
  close(): void
  /** A tela pode tratar as fontes citadas (ex.: abrir a movimentação ali mesmo). Devolve o cancelamento. */
  registerSourceHandler(handler: SourceHandler): () => void
}

const LexaAIContext = React.createContext<LexaAIValue | null>(null)

function useRouteContext(): AIContext {
  const pathname = usePathname()
  const data = useDemoData()
  const { can } = useSession()
  const [, root, id] = pathname.split("/")
  const process = root === "processos" && id && can("processes.view") ? data.processes.find((p) => p.id === id) : undefined
  const client = root === "clientes" && id && can("clients.view") ? data.clients.find((c) => c.id === id) : undefined
  const processCode = process?.code
  const clientName = client?.name
  return React.useMemo(() => {
    if (processCode && id) return processContext(id, processCode)
    if (clientName && id) return clientContext(id, clientName)
    return officeContext(root)
  }, [root, id, processCode, clientName])
}

export function LexaAIProvider({ children }: { children: React.ReactNode }) {
  const status = useAIStatus()
  const pathname = usePathname()
  const router = useRouter()
  const routeContext = useRouteContext()
  const [isOpen, setOpen] = React.useState(false)
  // Contexto pedido por uma ação (ex.: tarefa → processo). Vale só na tela em que foi pedido.
  const [override, setOverride] = React.useState<{ context: AIContext; path: string } | null>(null)
  const [request, setRequest] = React.useState<{ id: number; prompt: string } | null>(null)
  const requestId = React.useRef(0)
  const sourceHandler = React.useRef<SourceHandler | null>(null)

  const context = override && override.path === pathname ? override.context : routeContext

  const open = React.useCallback(
    (next?: AIContext) => {
      setOverride(next ? { context: next, path: pathname } : null)
      setOpen(true)
    },
    [pathname],
  )

  const ask = React.useCallback(
    (prompt: string, next?: AIContext) => {
      setOverride(next ? { context: next, path: pathname } : null)
      requestId.current += 1
      setRequest({ id: requestId.current, prompt })
      setOpen(true)
    },
    [pathname],
  )

  const close = React.useCallback(() => setOpen(false), [])

  const registerSourceHandler = React.useCallback((handler: SourceHandler) => {
    sourceHandler.current = handler
    return () => {
      if (sourceHandler.current === handler) sourceHandler.current = null
    }
  }, [])

  const handleRequest = React.useCallback((id: number) => setRequest((current) => (current?.id === id ? null : current)), [])

  const openSource = React.useCallback(
    (source: AISource) => {
      setOpen(false)
      if (sourceHandler.current) sourceHandler.current(source)
      else if (source.href) router.push(source.href)
    },
    [router],
  )

  const value = React.useMemo<LexaAIValue>(
    () => ({ status, ready: isAIReady(status), context, isOpen, open, ask, close, registerSourceHandler }),
    [status, context, isOpen, open, ask, close, registerSourceHandler],
  )

  return (
    <LexaAIContext.Provider value={value}>
      {children}
      <ChatHost
        key={scopeKey(context.scope)}
        context={context}
        open={isOpen}
        onOpenChange={setOpen}
        status={status}
        request={request}
        onRequestHandled={handleRequest}
        onOpenSource={openSource}
      />
    </LexaAIContext.Provider>
  )
}

/** Uma conversa por contexto: a `key` do escopo reinicia o estado ao trocar de processo/cliente. */
function ChatHost({
  context,
  open,
  onOpenChange,
  status,
  request,
  onRequestHandled,
  onOpenSource,
}: {
  context: AIContext
  open: boolean
  onOpenChange: (open: boolean) => void
  status: AIStatus | null
  request: { id: number; prompt: string } | null
  onRequestHandled: (id: number) => void
  onOpenSource: SourceHandler
}) {
  const chat = useAIChat(context.scope)
  const { send } = chat

  React.useEffect(() => {
    if (!request) return
    onRequestHandled(request.id)
    if (isAIReady(status)) send(request.prompt)
  }, [request, send, onRequestHandled, status])

  return <AIChatSheet open={open} onOpenChange={onOpenChange} chat={chat} context={context} status={status} onOpenSource={onOpenSource} />
}

export function useLexaAI() {
  const ctx = React.useContext(LexaAIContext)
  if (!ctx) throw new Error("useLexaAI deve ser usado dentro de LexaAIProvider")
  return ctx
}

/** Registra, enquanto a tela estiver montada, quem abre as fontes citadas pela LEXA IA. */
export function useAISourceHandler(handler: SourceHandler) {
  const { registerSourceHandler } = useLexaAI()
  React.useEffect(() => registerSourceHandler(handler), [registerSourceHandler, handler])
}
