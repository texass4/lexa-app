"use client"

import * as React from "react"
import { AIRequestError, aiApi, fetchAIStatus } from "@/lib/ai/client"
import { CHAT_LIMITS, CHAT_MODES, type ActionSuggestion, type AIMessage, type AISources, type AIStatus, type ChatMode, type ChatScope } from "@/lib/ai/types"
import { uid } from "@/lib/core/format"
import { useSession } from "@/lib/auth/session"
import { useUI } from "@/lib/store/ui-store"

const toError = (error: unknown) =>
  error instanceof AIRequestError ? error : new AIRequestError("UNEXPECTED", "Não foi possível concluir a análise agora.")

/** Estado da IA (ligada/configurada). Consulta leve, uma vez por sessão — não chama o modelo. */
export function useAIStatus() {
  const [status, setStatus] = React.useState<AIStatus | null>(null)
  React.useEffect(() => {
    let alive = true
    fetchAIStatus().then((next) => alive && setStatus(next))
    return () => {
      alive = false
    }
  }, [])
  return status
}

/**
 * Uma ação da Íntegra IA disparada pelo usuário. Ignora cliques repetidos enquanto
 * roda, mantém o resultado anterior visível durante a nova análise e cancela
 * a requisição ao sair da tela.
 */
export function useAIAction<T>() {
  const [state, setState] = React.useState<{ data?: T; error?: AIRequestError; loading: boolean }>({ loading: false })
  const controller = React.useRef<AbortController | null>(null)

  React.useEffect(() => () => controller.current?.abort(), [])

  const run = React.useCallback(async (task: (signal: AbortSignal) => Promise<T>) => {
    if (controller.current) return
    const current = new AbortController()
    controller.current = current
    setState((s) => ({ ...s, loading: true, error: undefined }))
    try {
      const data = await task(current.signal)
      setState({ data, loading: false })
    } catch (error) {
      const failure = toError(error)
      setState((s) => ({ ...s, loading: false, error: failure.code === "CANCELLED" ? undefined : failure }))
    } finally {
      if (controller.current === current) controller.current = null
    }
  }, [])

  const cancel = React.useCallback(() => controller.current?.abort(), [])

  return { ...state, run, cancel }
}

export interface ChatEntry {
  id: string
  role: AIMessage["role"]
  content: string
  sources?: AISources
  warnings?: string[]
}

const MODE_KEY = "integra.ai.chat-mode"

/** Modo escolhido da última vez (comodidade deste navegador; sem ele, "All"). */
function storedMode(): ChatMode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY)
    return CHAT_MODES.includes(saved as ChatMode) ? (saved as ChatMode) : "all"
  } catch {
    return "all"
  }
}

/** Modo da conversa (All, Escritório ou Jurisprudência), lembrado neste navegador. */
export function useChatMode() {
  const [mode, setModeState] = React.useState<ChatMode>("all")
  // Lê depois de montar: o servidor não conhece o navegador (evita diferença na hidratação).
  React.useEffect(() => {
    const saved = storedMode()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== "all") setModeState(saved)
  }, [])
  const setMode = React.useCallback((next: ChatMode) => {
    setModeState(next)
    try {
      window.localStorage.setItem(MODE_KEY, next)
    } catch {
      // Sem armazenamento (janela anônima): vale só nesta tela.
    }
  }, [])
  return [mode, setMode] as const
}

/**
 * Conversa com a Íntegra IA num escopo (processo, cliente ou escritório).
 * Quem usa deve montar o hook com `key` do escopo: trocar de processo começa
 * outra conversa, sem reaproveitar mensagens nem dados do anterior.
 */
export function useAIChat(scope: ChatScope, mode: ChatMode = "all") {
  const [messages, setMessages] = React.useState<ChatEntry[]>([])
  const [pending, setPending] = React.useState(false)
  const [failure, setFailure] = React.useState<{ error: AIRequestError; question: string } | null>(null)
  const controller = React.useRef<AbortController | null>(null)
  const scopeRef = React.useRef(scope)
  const modeRef = React.useRef(mode)
  React.useEffect(() => {
    modeRef.current = mode
  }, [mode])

  React.useEffect(() => () => controller.current?.abort(), [])

  const send = React.useCallback(
    async (text: string) => {
      const question = text.trim().slice(0, CHAT_LIMITS.messageChars)
      if (!question || controller.current) return
      const current = new AbortController()
      controller.current = current
      const userEntry: ChatEntry = { id: uid("msg"), role: "user", content: question }
      const history = [...messages, userEntry]
      setMessages(history)
      setPending(true)
      setFailure(null)
      try {
        const result = await aiApi.chat(
          scopeRef.current,
          history.slice(-CHAT_LIMITS.history).map(({ role, content }) => ({ role, content })),
          current.signal,
          modeRef.current,
        )
        setMessages((list) => [
          ...list,
          { id: uid("msg"), role: "assistant", content: result.data.text, sources: result.sources, warnings: result.warnings },
        ])
      } catch (failure) {
        const known = toError(failure)
        // Pergunta sem resposta sai do histórico: pode ser reenviada.
        setMessages((list) => list.filter((m) => m.id !== userEntry.id))
        if (known.code !== "CANCELLED") setFailure({ error: known, question })
      } finally {
        if (controller.current === current) controller.current = null
        setPending(false)
      }
    },
    [messages],
  )

  const cancel = React.useCallback(() => controller.current?.abort(), [])
  const reset = React.useCallback(() => {
    controller.current?.abort()
    setMessages([])
    setFailure(null)
  }, [])
  const retry = React.useCallback(() => {
    if (failure) send(failure.question)
  }, [failure, send])

  return { messages, pending, error: failure?.error ?? null, send, cancel, reset, retry }
}

export type AIChat = ReturnType<typeof useAIChat>

/** Rascunho de tarefa a partir de uma sugestão — abre o formulário normal; nada é salvo sem confirmação. */
export function useCreateTaskFromSuggestion(target: { processId?: string; clientId?: string }) {
  const { openDialog } = useUI()
  const { can } = useSession()
  if (!can("tasks.edit")) return undefined
  return (suggestion: ActionSuggestion) =>
    openDialog("task", {
      ...target,
      title: suggestion.titulo,
      description: [suggestion.descricao, suggestion.justificativa && `Motivo (Íntegra IA): ${suggestion.justificativa}`]
        .filter(Boolean)
        .join("\n\n"),
      priority: suggestion.prioridade,
    })
}
