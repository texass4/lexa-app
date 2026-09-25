"use client"

import * as React from "react"
import { Ellipsis, KeyRound, MailPlus, Pencil, Power, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { Panel, PanelHeader } from "@/components/ui/panel"
import { Button } from "@/components/ui/button"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ADMIN_PERMISSIONS, effectivePermissions, MEMBER_ROLES, MODULES, ROLE_LABELS, type MemberRole, type Permission } from "@/lib/auth/permissions"
import type { MemberAccess } from "@/lib/auth/profile"
import { isEmail } from "@/lib/auth/validation"
import { fmtNumericDate, fmtRelative } from "@/lib/dates"

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "Não foi possível concluir a ação.")
  return data as T
}

function statusOf(m: MemberAccess) {
  if (!m.active) return { tone: "neutral" as const, label: "Inativo" }
  if (m.invitePending) return { tone: "warning" as const, label: "Convite pendente" }
  return { tone: "success" as const, label: "Ativo" }
}

/* ------------------------------- Convidar -------------------------------- */

function InviteForm({ apiBase, onDone }: { apiBase: string; onDone: () => void }) {
  const [form, setForm] = React.useState({ name: "", email: "", role: "lawyer" as MemberRole, jobTitle: "" })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 3) return setError("Informe o nome completo.")
    if (!isEmail(form.email.trim())) return setError("E-mail inválido.")
    setError("")
    setBusy(true)
    try {
      await call(apiBase, "POST", form)
      toast.success("Convite enviado.", { description: `${form.email} vai receber o link para criar a senha.` })
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <ModalBody>
        <form id="invite-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {error && (
            <p role="alert" className="text-[12.5px] text-danger sm:col-span-2">
              {error}
            </p>
          )}
          <Field label="Nome completo" htmlFor="inv-name" className="sm:col-span-2">
            <TextInput id="inv-name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="E-mail" htmlFor="inv-email" className="sm:col-span-2">
            <TextInput id="inv-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Papel" htmlFor="inv-role" hint="Define as permissões iniciais; dá para ajustar depois.">
            <NativeSelect id="inv-role" value={form.role} onChange={(e) => set("role", e.target.value as MemberRole)}>
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Cargo" htmlFor="inv-job" optional>
            <TextInput id="inv-job" placeholder="Ex.: Advogada associada" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="invite-form" disabled={busy}>
          {busy ? "Enviando…" : "Enviar convite"}
        </Button>
      </ModalFooter>
    </>
  )
}

/* -------------------------------- Editar --------------------------------- */

function EditForm({ member, self, url, onDone }: { member: MemberAccess; self: boolean; url: string; onDone: (changed: boolean) => void }) {
  const [form, setForm] = React.useState({ name: member.name, jobTitle: member.jobTitle ?? "", role: member.role as MemberRole })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 3) return setError("Informe o nome completo.")
    setBusy(true)
    try {
      await call(url, "PATCH", {
        name: form.name,
        jobTitle: form.jobTitle,
        ...(form.role !== member.role ? { role: form.role } : {}),
      })
      toast.success("Usuário atualizado.")
      onDone(true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <ModalBody>
        <form id="edit-member-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {error && (
            <p role="alert" className="text-[12.5px] text-danger sm:col-span-2">
              {error}
            </p>
          )}
          <Field label="Nome completo" htmlFor="em-name" className="sm:col-span-2">
            <TextInput id="em-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Cargo" htmlFor="em-job" optional>
            <TextInput id="em-job" value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
          </Field>
          <Field
            label="Papel"
            htmlFor="em-role"
            hint={self ? "Você não pode mudar o próprio papel." : "Trocar o papel volta as permissões ao padrão dele."}
          >
            <NativeSelect
              id="em-role"
              disabled={self}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as MemberRole }))}
            >
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => onDone(false)}>
          Cancelar
        </Button>
        <Button type="submit" form="edit-member-form" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </Button>
      </ModalFooter>
    </>
  )
}

/* ------------------------------ Permissões ------------------------------- */

function PermissionsForm({ member, url, onDone }: { member: MemberAccess; url: string; onDone: (changed: boolean) => void }) {
  const role = member.role as MemberRole
  const [perms, setPerms] = React.useState(() => new Set<Permission>(effectivePermissions(role, member.permissions)))
  const [busy, setBusy] = React.useState(false)

  const toggle = (p: Permission, on: boolean) =>
    setPerms((current) => {
      const next = new Set(current)
      if (on) next.add(p)
      else next.delete(p)
      // Editar sem ver não faz sentido: um puxa o outro.
      const [mod, action] = p.split(".")
      if (on && action === "edit") next.add(`${mod}.view` as Permission)
      if (!on && action === "view") next.delete(`${mod}.edit` as Permission)
      return next
    })

  const save = async (permissions: Permission[] | null) => {
    setBusy(true)
    try {
      await call(url, "PATCH", { permissions })
      toast.success(permissions ? "Permissões salvas." : "Permissões voltaram ao padrão do papel.")
      onDone(true)
    } catch (err) {
      toast.error((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <ModalBody>
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          {member.permissions ? "Permissões personalizadas." : `Usando o padrão de ${ROLE_LABELS[role]}.`} O acesso é aplicado pelo banco de dados — o
          que estiver desligado fica invisível e bloqueado para {member.firstName}.
        </p>
        <div className="overflow-hidden rounded-[12px] border border-border">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th>Módulo</Th>
                <Th className="w-20 text-center">Ver</Th>
                <Th className="w-20 text-center">Editar</Th>
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.key}>
                  <Td className="font-medium">{m.label}</Td>
                  {(["view", "edit"] as const).map((action) => {
                    const p = `${m.key}.${action}` as Permission
                    return (
                      <Td key={action} className="text-center">
                        <span className="inline-flex">
                          <ToggleSwitch
                            label={`${m.label} — ${action === "view" ? "ver" : "editar"}`}
                            checked={perms.has(p)}
                            onChange={(v) => toggle(p, v)}
                          />
                        </span>
                      </Td>
                    )
                  })}
                </tr>
              ))}
              {ADMIN_PERMISSIONS.map((a) => (
                <tr key={a.key}>
                  <Td className="font-medium" colSpan={2}>
                    {a.label}
                  </Td>
                  <Td className="text-center">
                    <span className="inline-flex">
                      <ToggleSwitch label={a.label} checked={perms.has(a.key)} onChange={(v) => toggle(a.key, v)} />
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" className="sm:mr-auto" disabled={busy || !member.permissions} onClick={() => save(null)}>
          Restaurar padrão do papel
        </Button>
        <Button variant="secondary" onClick={() => onDone(false)}>
          Cancelar
        </Button>
        <Button disabled={busy} onClick={() => save([...perms])}>
          {busy ? "Salvando…" : "Salvar permissões"}
        </Button>
      </ModalFooter>
    </>
  )
}

/* ------------------------------- Tabela ---------------------------------- */

type Dialog = { kind: "invite" } | { kind: "edit" | "permissions" | "remove"; member: MemberAccess } | null

/**
 * Lista e gestão dos usuários de um escritório. `apiBase` aponta para as rotas do
 * próprio escritório (`/api/team/users`) ou do Super Admin
 * (`/api/admin/organizations/<id>/users`); a autorização é sempre no servidor.
 */
export function MembersManager({
  apiBase,
  currentUserId,
  onChanged,
  title = "Usuários",
}: {
  apiBase: string
  currentUserId?: string
  onChanged?: () => void
  title?: string
}) {
  const [members, setMembers] = React.useState<MemberAccess[] | null>(null)
  const [loadError, setLoadError] = React.useState(false)
  const [dialog, setDialog] = React.useState<Dialog>(null)
  // Mantém o conteúdo do diálogo enquanto ele anima ao fechar.
  const [shown, setShown] = React.useState<Dialog>(null)
  if (dialog && dialog !== shown) setShown(dialog)

  const load = React.useCallback(async () => {
    try {
      const { members: list } = await call<{ members: MemberAccess[] }>(apiBase, "GET")
      setMembers(list)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [apiBase])

  React.useEffect(() => {
    // Busca inicial da lista no servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const changed = async () => {
    await load()
    onChanged?.()
  }

  const close = (didChange = false) => {
    setDialog(null)
    if (didChange) changed()
  }

  const act = async (member: MemberAccess, action: "toggle" | "invite") => {
    try {
      if (action === "toggle") {
        await call(`${apiBase}/${member.id}`, "PATCH", { active: !member.active })
        toast.success(member.active ? "Usuário desativado." : "Usuário reativado.", { description: member.name })
        changed()
      } else {
        await call(`${apiBase}/${member.id}/invite`, "POST")
        toast.success("Convite reenviado.", { description: member.email })
      }
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const remove = async (member: MemberAccess) => {
    try {
      await call(`${apiBase}/${member.id}`, "DELETE")
      toast.success("Usuário removido.", { description: member.name })
      changed()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const d = dialog ?? shown
  const active = members?.filter((m) => m.active).length ?? 0

  return (
    <Panel>
      <PanelHeader
        title={title}
        description={members ? `${active} ${active === 1 ? "pessoa ativa" : "pessoas ativas"} · ${members.length} no total` : undefined}
        action={
          <Button size="sm" onClick={() => setDialog({ kind: "invite" })}>
            <UserPlus /> Convidar
          </Button>
        }
      />
      {loadError ? (
        <EmptyState
          compact
          icon={<UsersRound />}
          title="Não foi possível carregar os usuários."
          action={
            <Button size="sm" variant="secondary" onClick={load}>
              Tentar de novo
            </Button>
          }
        />
      ) : !members ? (
        <div className="px-5 pb-5">
          <SkeletonTable />
        </div>
      ) : (
        <TableShell className="rounded-none border-x-0 border-b-0 shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Papel</Th>
                  <Th>Status</Th>
                  <Th>Último acesso</Th>
                  <Th>Membro desde</Th>
                  <Th className="w-10" aria-label="Ações" />
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-0">
                {members.map((m) => {
                  const self = m.id === currentUserId
                  const status = statusOf(m)
                  return (
                    <tr key={m.id} className={m.active ? undefined : "opacity-60"}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <UserAvatar name={m.name} src={m.avatarUrl} tone={self ? "dark" : undefined} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {m.name} {self && <span className="text-[11.5px] font-normal text-subtle">(você)</span>}
                            </p>
                            <p className="truncate text-[12px] text-muted-foreground">
                              {m.email}
                              {m.jobTitle && ` · ${m.jobTitle}`}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <StatusBadge tone={m.role === "owner" ? "gold" : "neutral"} dot={false}>
                          {ROLE_LABELS[m.role]}
                        </StatusBadge>
                        {m.permissions && m.role !== "owner" && <p className="mt-1 text-[11px] text-subtle">Permissões personalizadas</p>}
                      </Td>
                      <Td>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{m.lastSignInAt ? fmtRelative(m.lastSignInAt) : "Nunca entrou"}</Td>
                      <Td className="tabular whitespace-nowrap text-muted-foreground">{fmtNumericDate(m.createdAt)}</Td>
                      <Td>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Ações para ${m.name}`}
                            className="flex size-8 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-accent"
                          >
                            <Ellipsis className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-[10px] p-1">
                            <DropdownMenuGroup>
                              <DropdownMenuItem className="h-8 px-2" onClick={() => setDialog({ kind: "edit", member: m })}>
                                <Pencil /> Editar
                              </DropdownMenuItem>
                              {!self && m.role !== "owner" && (
                                <DropdownMenuItem className="h-8 px-2" onClick={() => setDialog({ kind: "permissions", member: m })}>
                                  <ShieldCheck /> Permissões
                                </DropdownMenuItem>
                              )}
                              {m.invitePending && m.active && (
                                <DropdownMenuItem className="h-8 px-2" onClick={() => act(m, "invite")}>
                                  <MailPlus /> Reenviar convite
                                </DropdownMenuItem>
                              )}
                              {!self && !m.invitePending && (
                                <DropdownMenuItem className="h-8 px-2" onClick={() => act(m, "invite")}>
                                  <KeyRound /> Enviar link de nova senha
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuGroup>
                            {!self && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                  <DropdownMenuItem className="h-8 px-2" onClick={() => act(m, "toggle")}>
                                    <Power /> {m.active ? "Desativar" : "Reativar"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="h-8 px-2"
                                    variant="destructive"
                                    onClick={() => setDialog({ kind: "remove", member: m })}
                                  >
                                    <Trash2 /> Remover
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TableShell>
      )}

      <Modal
        open={dialog?.kind === "invite"}
        onOpenChange={(o) => !o && close()}
        title="Convidar usuário"
        description="A pessoa recebe um link para criar a própria senha."
        icon={<UserPlus />}
        bare
      >
        <InviteForm apiBase={apiBase} onDone={() => close(true)} />
      </Modal>

      <Modal
        open={dialog?.kind === "edit"}
        onOpenChange={(o) => !o && close()}
        title="Editar usuário"
        description={d && d.kind !== "invite" ? d.member.email : undefined}
        icon={<Pencil />}
        bare
      >
        {d?.kind === "edit" && <EditForm member={d.member} self={d.member.id === currentUserId} url={`${apiBase}/${d.member.id}`} onDone={close} />}
      </Modal>

      <Modal
        open={dialog?.kind === "permissions"}
        onOpenChange={(o) => !o && close()}
        title={d?.kind === "permissions" ? `Permissões de ${d.member.firstName}` : "Permissões"}
        icon={<ShieldCheck />}
        size="lg"
        bare
      >
        {d?.kind === "permissions" && <PermissionsForm member={d.member} url={`${apiBase}/${d.member.id}`} onDone={close} />}
      </Modal>

      <ConfirmDialog
        open={dialog?.kind === "remove"}
        onOpenChange={(o) => !o && close()}
        title={`Remover ${d?.kind === "remove" ? d.member.name : ""}?`}
        description="A conta é apagada e a pessoa perde o acesso na hora. Clientes, tarefas e documentos criados por ela continuam no escritório."
        confirmLabel="Remover"
        onConfirm={() => d?.kind === "remove" && remove(d.member)}
      />
    </Panel>
  )
}
