/**
 * Contexto da IA da Central de Atendimento — sem rede e sem `next/server`, para os
 * testes. O que vem do cliente (mensagens, nome do contato, nomes de arquivo) é texto
 * de terceiro: entra serializado, com o autor definido pela Íntegra, e nunca como
 * instrução. Os dados do escritório só entram se a pessoa tiver acesso a eles.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpError } from "@/lib/auth/http-error"
import { allow } from "@/lib/auth/protection/rate-limit"
import { formatPhone } from "@/lib/whatsapp/phone"
import { statusOption, TYPE_PREVIEW } from "@/lib/whatsapp/config"
import type { Actor, LoadedConversation } from "./actor"

const HISTORY_LIMIT = 150

/**
 * Limites da IA do Atendimento (a chamada é cara: até 150 mensagens e 4 arquivos). Por
 * pessoa e por escritório — as duas regras contam.
 */
export const AI_RULES = {
  user: { id: "whatsapp-ai:user", limit: 20, windowSeconds: 600 },
  organization: { id: "whatsapp-ai:org", limit: 300, windowSeconds: 86_400 },
}


/** Conta a análise nas duas regras (pessoa e escritório) e recusa com 429 se passou de alguma. */
export async function assertAiQuota(actor: Pick<Actor, "userId" | "organizationId">) {
  const [byUser, byOrg] = await Promise.all([allow(AI_RULES.user, actor.userId), allow(AI_RULES.organization, actor.organizationId)])
  if (!byUser || !byOrg) throw new HttpError(429, "Muitas análises em pouco tempo. Aguarde alguns minutos e tente de novo.")
}

/** Texto de terceiros numa linha só: sem quebras, sem caracteres de controle e sem "<" ">" (que imitariam as tags do contexto). */
export const inline = (text: string | null | undefined, max = 120) =>
  (text ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)

/** JSON sem "<": o conteúdo não fecha nem abre as tags <conversa>/<contexto> do pedido. */
export const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")

export interface HistoryRow {
  id: string
  direction: "inbound" | "outbound" | "internal"
  type: keyof typeof TYPE_PREVIEW
  body: string | null
  sent_at: string
  from_device: boolean
  sent_by_user_id: string | null
  attachments: { id: string; kind: string; file_name: string | null; mime_type: string | null; storage_path: string | null; size_bytes: number | null }[]
}

const time = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

/**
 * Transcrição: uma linha JSON por mensagem. O autor vem da direção gravada pela Íntegra,
 * nunca do texto — quebras de linha ou "NOTA INTERNA:" escritas pelo cliente ficam
 * dentro do campo "texto" e não forjam outra fala.
 */
export function renderTranscript(history: HistoryRow[], contactName: string, memberName: Map<string, string>) {
  return history
    .map((m) => {
      const autor =
        m.direction === "inbound"
          ? "CLIENTE"
          : m.direction === "internal"
            ? m.type === "note"
              ? "NOTA INTERNA"
              : "REGISTRO"
            : "ESCRITÓRIO"
      const quem =
        m.direction === "inbound"
          ? inline(contactName)
          : m.sent_by_user_id
            ? (memberName.get(m.sent_by_user_id) ?? "equipe")
            : m.direction === "outbound" && m.from_device
              ? "celular"
              : undefined
      const anexos = m.attachments.map((a) => `${TYPE_PREVIEW[a.kind as keyof typeof TYPE_PREVIEW] ?? "Arquivo"}${a.file_name ? `: ${inline(a.file_name, 80)}` : ""}`)
      return safeJson({
        em: time(m.sent_at),
        autor,
        ...(quem ? { quem } : {}),
        texto: m.body?.trim() || (anexos.length ? undefined : `[${TYPE_PREVIEW[m.type]}]`),
        ...(anexos.length ? { anexos } : {}),
      })
    })
    .join("\n")
}

export interface ContextDeps {
  /** Cliente com a service role (o chamador). Por isso a permissão é conferida aqui. */
  db: SupabaseClient
  load: (actor: Actor, conversationId: string) => Promise<LoadedConversation>
}

export async function buildContext(actor: Actor, conversationId: string, deps: ContextDeps) {
  const { db } = deps
  const conversation = await deps.load(actor, conversationId)
  // Nome do contato vem do próprio remetente (push name): texto de terceiro.
  const contactName = inline(conversation.contact.name || conversation.contact.push_name || formatPhone(conversation.contact.phone))

  const { data: rows } = await db
    .from("whatsapp_messages")
    .select("id, direction, type, body, sent_at, from_device, sent_by_user_id, attachments:whatsapp_message_attachments(id, kind, file_name, mime_type, storage_path, size_bytes)")
    .eq("conversation_id", conversation.id)
    .order("sent_at", { ascending: false })
    .limit(HISTORY_LIMIT)
  const history = ((rows ?? []) as HistoryRow[]).reverse()
  if (!history.some((m) => m.direction !== "internal")) throw new HttpError(409, "Ainda não há mensagens nesta conversa.")

  const { data: members } = await db.from("profiles").select("id, name").eq("organization_id", actor.organizationId)
  const memberName = new Map((members ?? []).map((m) => [m.id as string, m.name as string]))

  // A leitura é com a service role: o que a pessoa não pode ver em Clientes e Processos
  // não entra no pedido nem volta na resposta (a permissão é conferida aqui, no servidor).
  const canClients = actor.can("clients.view")
  const canProcesses = actor.can("processes.view")
  let clientBlock = "Contato ainda não vinculado a um cliente do escritório."
  const processes: { number: string; label: string }[] = []
  if (conversation.contact.client_id) {
    const [{ data: clientRow }, { data: processRows }] = await Promise.all([
      canClients
        ? db.from("clients").select("data").eq("organization_id", actor.organizationId).eq("id", conversation.contact.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      canProcesses
        ? db.from("processes").select("data").eq("organization_id", actor.organizationId).eq("data->>clientId", conversation.contact.client_id)
        : Promise.resolve({ data: [] as { data: unknown }[] }),
    ])
    const c = clientRow?.data as { name?: string; area?: string } | undefined
    if (!canClients) clientBlock = "Contato vinculado a um cliente (dados do cliente fora do acesso de quem pediu)."
    else if (c) clientBlock = `Cliente: ${c.name ?? contactName}${c.area ? ` · área ${c.area}` : ""}`
    for (const row of processRows ?? []) {
      const p = row.data as { number?: string; code?: string; type?: string; className?: string; subject?: string; status?: string; court?: string }
      const number = p.number || p.code || ""
      processes.push({ number, label: [number, p.className ?? p.type, p.subject, p.court, p.status].filter(Boolean).join(" · ") })
    }
  }

  const context = [
    `Atendimento pelo WhatsApp com ${contactName} (${formatPhone(conversation.contact.phone)}).`,
    `Status atual: ${statusOption(conversation.status ?? "new").label}. Hoje: ${time(new Date().toISOString())}.`,
    clientBlock,
    !canProcesses
      ? "Processos do cliente fora do acesso de quem pediu."
      : processes.length
        ? `Processos cadastrados do cliente:\n${processes.map((p) => `- ${p.label}`).join("\n")}`
        : "Nenhum processo cadastrado para este contato.",
  ].join("\n")

  return { conversation, history, transcript: renderTranscript(history, contactName, memberName), context, processes }
}

