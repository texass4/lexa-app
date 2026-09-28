"use client"

import * as React from "react"
import { Check, MessageSquarePlus, UserPlus, UserRoundCheck, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { SearchField } from "@/components/ui/search-field"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useSession } from "@/lib/auth/session"
import { userTitle } from "@/lib/account"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { PRACTICE_AREAS } from "@/lib/config"
import { matches } from "@/lib/format"
import { isEmail, maskDocument, maskPhone } from "@/lib/masks"
import { formatPhone, normalizeWhatsAppPhone } from "@/lib/whatsapp/phone"
import { whatsappApi } from "@/lib/whatsapp/client"
import type { PracticeArea, WhatsAppContact, WhatsAppConversation } from "@/types"
import { contactName } from "./parts"

/* ------------------------------- Responsável ------------------------------ */

export function AssignDialog({
  open,
  onOpenChange,
  conversation,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversation: WhatsAppConversation
  onChanged: (conversation: WhatsAppConversation) => void
}) {
  const { members, user, can } = useSession()
  const [query, setQuery] = React.useState("")
  const [saving, setSaving] = React.useState<string | null>(null)
  const canAssign = can("whatsapp.assign")
  const active = members.filter((m) => m.active && matches(query, m.name, m.jobTitle))

  const choose = async (userId: string | null) => {
    setSaving(userId ?? "none")
    try {
      onChanged(await whatsappApi.update(conversation.id, { assignedUserId: userId }))
      onOpenChange(false)
      toast.success(userId ? (userId === user.id ? "Você assumiu a conversa." : "Responsável alterado.") : "Conversa sem responsável.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o responsável.")
    } finally {
      setSaving(null)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Responsável pela conversa" description="Quem acompanha este atendimento." icon={<UsersRound />} size="sm" bare>
      <ModalBody>
        {!canAssign ? (
          <div className="space-y-3 text-[13.5px] text-muted-foreground">
            <p>Só quem distribui conversas pode escolher o responsável.</p>
            {!conversation.assignedUserId && (
              <Button onClick={() => choose(user.id)} disabled={!!saving}>
                <UserRoundCheck /> Assumir esta conversa
              </Button>
            )}
          </div>
        ) : (
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Buscar pessoa" />
            <ul className="-mx-2 mt-3 max-h-[320px] overflow-y-auto thin-scrollbar">
              {active.map((m) => {
                const current = conversation.assignedUserId === m.id
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={!!saving}
                      onClick={() => choose(m.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                        current && "bg-surface-muted",
                      )}
                    >
                      <UserAvatar name={m.name} src={m.avatarUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">
                          {m.name}
                          {m.id === user.id && <span className="font-normal text-subtle"> (você)</span>}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">{userTitle(m)}</span>
                      </span>
                      {current && <Check className="size-4 text-gold" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </ModalBody>
      {canAssign && conversation.assignedUserId && (
        <ModalFooter>
          <Button variant="ghost" onClick={() => choose(null)} disabled={!!saving}>
            Deixar sem responsável
          </Button>
        </ModalFooter>
      )}
    </Modal>
  )
}

/* ------------------------------ Nova conversa ----------------------------- */

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (conversation: WhatsAppConversation) => void
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Nova conversa" description="Escreva para um cliente ou um número." icon={<MessageSquarePlus />} size="sm" bare>
      <NewConversationForm onClose={() => onOpenChange(false)} onCreated={onCreated} />
    </Modal>
  )
}

function NewConversationForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: WhatsAppConversation) => void }) {
  const { clients } = useDemoData()
  const [clientId, setClientId] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const withPhone = clients.filter((c) => c.phone?.replace(/\D/g, "").length >= 10).sort((a, b) => a.name.localeCompare(b.name))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const client = clients.find((c) => c.id === clientId)
    const number = normalizeWhatsAppPhone(client?.phone || phone)
    if (!number) {
      setError("Informe um telefone com DDD.")
      return
    }
    setSaving(true)
    try {
      const conversation = await whatsappApi.start({ phone: number, clientId: client?.id, name: client?.name })
      onCreated(conversation)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a conversa.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ModalBody>
        <form id="new-conversation" onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Cliente" htmlFor="nc-client" optional>
            <NativeSelect
              id="nc-client"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value)
                setError("")
              }}
            >
              <option value="">Outro número</option>
              {withPhone.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {!clientId && (
            <Field label="WhatsApp" htmlFor="nc-phone" error={error} hint="Com DDD. Para outro país, comece com +.">
              <TextInput
                id="nc-phone"
                inputMode="tel"
                autoFocus
                placeholder="(11) 99999-8888"
                value={phone}
                aria-invalid={!!error}
                onChange={(e) => {
                  setPhone(e.target.value.startsWith("+") ? e.target.value : maskPhone(e.target.value))
                  setError("")
                }}
              />
            </Field>
          )}
          {clientId && error && <p className="text-[12px] text-danger">{error}</p>}
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="new-conversation" disabled={saving}>
          {saving ? "Abrindo…" : "Abrir conversa"}
        </Button>
      </ModalFooter>
    </>
  )
}

/* ------------------------ Transformar em cliente ------------------------- */

const KINDS = ["Pessoa física", "Pessoa jurídica"] as const

export function ConvertToClientDialog({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (open: boolean) => void; contact: WhatsAppContact }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Transformar em cliente"
      description="Confirme os dados. A conversa fica vinculada ao novo cadastro."
      icon={<UserPlus />}
      bare
    >
      <ConvertForm contact={contact} onClose={() => onOpenChange(false)} />
    </Modal>
  )
}

function ConvertForm({ contact, onClose }: { contact: WhatsAppContact; onClose: () => void }) {
  const { user, members } = useSession()
  const { clients } = useDemoData()
  const { addClient } = useDemoActions()
  const national = contact.phone.startsWith("55") ? contact.phone.slice(2) : contact.phone
  const [form, setForm] = React.useState({
    kind: "Pessoa física" as (typeof KINDS)[number],
    name: contact.name || contact.pushName || "",
    document: "",
    email: "",
    phone: contact.phone.startsWith("55") ? maskPhone(national) : formatPhone(contact.phone),
    area: "Cível" as PracticeArea,
    ownerId: user.id,
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const pj = form.kind === "Pessoa jurídica"
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 3) next.name = pj ? "Informe a razão social." : "Informe o nome completo."
    const digits = form.document.replace(/\D/g, "")
    if (digits && digits.length !== (pj ? 14 : 11)) next.document = pj ? "CNPJ deve ter 14 dígitos." : "CPF deve ter 11 dígitos."
    else if (digits && clients.some((c) => c.document.replace(/\D/g, "") === digits)) next.document = `Já existe um cliente com este ${pj ? "CNPJ" : "CPF"}.`
    if (form.email && !isEmail(form.email)) next.email = "E-mail inválido."
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    const client = addClient({
      name: form.name.trim(),
      kind: pj ? "PJ" : "PF",
      document: form.document,
      email: form.email,
      phone: form.phone,
      address: "Endereço a completar",
      area: form.area,
      ownerId: form.ownerId,
    })
    // O cadastro vai para o banco em seguida; o vínculo só existe depois dele.
    await new Promise((r) => setTimeout(r, 700))
    try {
      await linkWithRetry(contact.id, client.id)
      toast.success("Cliente cadastrado e vinculado à conversa.", { description: client.name })
      onClose()
    } catch {
      // O cadastro ficou salvo; só o vínculo falhou — dá para refazer por "Vincular a cliente".
      toast.error("Cliente cadastrado, mas não foi possível vincular a conversa.", {
        description: "Use \"Vincular a cliente existente\" no painel ao lado.",
      })
      onClose()
    }
  }

  return (
    <>
      <ModalBody>
        <form id="convert-client" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[12.5px] font-medium">Tipo de cliente</span>
            <ChoiceChips ariaLabel="Tipo de cliente" options={KINDS} value={form.kind} onChange={(v) => set("kind", v)} />
          </div>
          <Field label={pj ? "Razão social" : "Nome completo"} htmlFor="cv-name" error={errors.name} className="sm:col-span-2">
            <TextInput id="cv-name" autoFocus value={form.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={pj ? "CNPJ" : "CPF"} htmlFor="cv-doc" error={errors.document} optional>
            <TextInput id="cv-doc" inputMode="numeric" value={form.document} aria-invalid={!!errors.document} onChange={(e) => set("document", maskDocument(e.target.value))} />
          </Field>
          <Field label="Telefone" htmlFor="cv-phone">
            <TextInput id="cv-phone" value={form.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} />
          </Field>
          <Field label="E-mail" htmlFor="cv-email" error={errors.email} optional>
            <TextInput id="cv-email" type="email" value={form.email} aria-invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Área" htmlFor="cv-area">
            <NativeSelect id="cv-area" value={form.area} onChange={(e) => set("area", e.target.value as PracticeArea)}>
              {PRACTICE_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Responsável" htmlFor="cv-owner" className="sm:col-span-2">
            <NativeSelect id="cv-owner" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              {members
                .filter((m) => m.active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" form="convert-client" disabled={saving}>
          {saving ? "Cadastrando…" : "Cadastrar cliente"}
        </Button>
      </ModalFooter>
    </>
  )
}

/** O cliente acabou de ser criado no navegador: espera a gravação terminar antes de vincular. */
async function linkWithRetry(contactId: string, clientId: string) {
  let last: unknown
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await whatsappApi.updateContact(contactId, { clientId })
      return
    } catch (error) {
      last = error
      if (!(error instanceof Error) || !/Cliente não encontrado/.test(error.message)) throw error
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw last
}

/* --------------------------- Vincular a cliente --------------------------- */

export function LinkClientDialog({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (open: boolean) => void; contact: WhatsAppContact }) {
  const { clients } = useDemoData()
  const [query, setQuery] = React.useState("")
  const [saving, setSaving] = React.useState<string | null>(null)
  const list = clients.filter((c) => matches(query, c.name, c.document, c.phone, c.email)).slice(0, 50)

  const link = async (clientId: string, name: string) => {
    setSaving(clientId)
    try {
      await whatsappApi.updateContact(contact.id, { clientId })
      toast.success("Conversa vinculada ao cliente.", { description: name })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível vincular.")
    } finally {
      setSaving(null)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Vincular a um cliente" description={`Contato: ${contactName(contact)}`} icon={<UserRoundCheck />} size="sm" bare>
      <ModalBody>
        <SearchField value={query} onChange={setQuery} placeholder="Nome, CPF, telefone ou e-mail" />
        <ul className="-mx-2 mt-3 max-h-[340px] overflow-y-auto thin-scrollbar">
          {list.length === 0 && <li className="px-2 py-6 text-center text-[13px] text-muted-foreground">Nenhum cliente encontrado.</li>}
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={!!saving}
                onClick={() => link(c.id, c.name)}
                className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
              >
                <UserAvatar name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{c.name}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {[c.document, c.phone].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ModalBody>
    </Modal>
  )
}

/* ------------------------- Confirmação de ação da IA ---------------------- */

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  children,
  onConfirm,
  icon,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  children?: React.ReactNode
  onConfirm: () => Promise<void> | void
  icon?: React.ReactNode
}) {
  const [busy, setBusy] = React.useState(false)
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} icon={icon} size="sm" bare>
      <ModalBody>{children}</ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
              onOpenChange(false)
            } finally {
              setBusy(false)
            }
          }}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
