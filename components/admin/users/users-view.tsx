"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowRightLeft, Ellipsis, KeyRound, Pencil, Power, ScrollText, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { EmptyState, ErrorState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { adminFetch, useAdminData } from "@/lib/admin/client"
import type { AdminUser, OrgStatus } from "@/lib/admin/catalog"
import { MEMBER_ROLES, ROLE_LABELS, type MemberRole } from "@/lib/auth/permissions"
import { isEmail } from "@/lib/auth/validation"
import { fmtNumericDate, fmtRelative, getNow } from "@/lib/dates"
import { matches } from "@/lib/format"
import { AdminHeader, rowMenuTrigger } from "../ui/admin-header"
import { ConfirmAction, type ConfirmRequest } from "../ui/confirm-action"

type OrgOption = { id: string; name: string; status: OrgStatus }
type StatusFilter = "all" | "active" | "inactive" | "invited"
type Dialog = { kind: "create" } | { kind: "edit" | "move"; user: AdminUser } | null

const userUrl = (u: Pick<AdminUser, "id" | "organizationId">) => `/api/admin/organizations/${u.organizationId}/users/${u.id}`

function statusOf(u: AdminUser) {
  if (!u.active) return { tone: "neutral" as const, label: "Inativo" }
  if (u.organizationStatus !== "active") return { tone: "warning" as const, label: "Escritório sem acesso" }
  if (u.invitePending) return { tone: "info" as const, label: "Convite pendente" }
  return { tone: "success" as const, label: "Ativo" }
}

function FormError({ children }: { children?: string }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:col-span-2">
      {children}
    </p>
  )
}

function CreateForm({ orgs, defaultOrg, onDone }: { orgs: OrgOption[]; defaultOrg?: string; onDone: (ok: boolean) => void }) {
  const selectable = orgs.filter((o) => o.status !== "inactive")
  const [form, setForm] = React.useState({ organizationId: defaultOrg ?? selectable[0]?.id ?? "", name: "", email: "", role: "lawyer" as MemberRole, jobTitle: "" })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.organizationId) return setError("Escolha o escritório.")
    if (form.name.trim().length < 3) return setError("Informe o nome completo.")
    if (!isEmail(form.email.trim())) return setError("E-mail inválido.")
    setBusy(true)
    setError("")
    try {
      await adminFetch(`/api/admin/organizations/${form.organizationId}/users`, "POST", { name: form.name, email: form.email, role: form.role, jobTitle: form.jobTitle })
      toast.success("Usuário criado.", { description: `${form.email} recebeu o link para criar a senha.` })
      onDone(true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <ModalBody>
        <form id="admin-create-user" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormError>{error}</FormError>
          <Field label="Escritório" htmlFor="cu-org" className="sm:col-span-2">
            <NativeSelect id="cu-org" value={form.organizationId} onChange={(e) => set("organizationId", e.target.value)}>
              {selectable.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Nome completo" htmlFor="cu-name" className="sm:col-span-2">
            <TextInput id="cu-name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="E-mail" htmlFor="cu-email" className="sm:col-span-2">
            <TextInput id="cu-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Papel" htmlFor="cu-role">
            <NativeSelect id="cu-role" value={form.role} onChange={(e) => set("role", e.target.value as MemberRole)}>
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Cargo" htmlFor="cu-job" optional>
            <TextInput id="cu-job" placeholder="Ex.: Advogada associada" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => onDone(false)}>
          Cancelar
        </Button>
        <Button type="submit" form="admin-create-user" disabled={busy || !selectable.length}>
          {busy ? "Criando…" : "Criar e enviar convite"}
        </Button>
      </ModalFooter>
    </>
  )
}

function EditForm({ user, onDone }: { user: AdminUser; onDone: (ok: boolean) => void }) {
  const [form, setForm] = React.useState({ name: user.name, jobTitle: user.jobTitle ?? "", role: user.role as MemberRole })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 3) return setError("Informe o nome completo.")
    setBusy(true)
    try {
      await adminFetch(userUrl(user), "PATCH", { name: form.name, jobTitle: form.jobTitle, ...(form.role !== user.role ? { role: form.role } : {}) })
      toast.success("Usuário atualizado.", { description: form.name })
      onDone(true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <ModalBody>
        <form id="admin-edit-user" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormError>{error}</FormError>
          <Field label="Nome completo" htmlFor="eu-name" className="sm:col-span-2">
            <TextInput id="eu-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Cargo" htmlFor="eu-job" optional>
            <TextInput id="eu-job" value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} />
          </Field>
          <Field label="Papel" htmlFor="eu-role" hint="Trocar o papel volta as permissões ao padrão dele.">
            <NativeSelect id="eu-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as MemberRole }))}>
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
        <Button type="submit" form="admin-edit-user" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </Button>
      </ModalFooter>
    </>
  )
}

function MoveForm({ user, orgs, onDone }: { user: AdminUser; orgs: OrgOption[]; onDone: (ok: boolean) => void }) {
  const options = orgs.filter((o) => o.id !== user.organizationId && o.status !== "inactive")
  const [target, setTarget] = React.useState(options[0]?.id ?? "")
  const [role, setRole] = React.useState(user.role as MemberRole)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) return setError("Escolha o escritório de destino.")
    setBusy(true)
    try {
      await adminFetch(`/api/admin/users/${user.id}`, "PATCH", { organizationId: target, role })
      toast.success("Usuário movido.", { description: `${user.name} → ${orgs.find((o) => o.id === target)?.name}` })
      onDone(true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <ModalBody>
        <form id="admin-move-user" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormError>{error}</FormError>
          <p className="rounded-[10px] border border-warning/20 bg-warning-soft/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-warning sm:col-span-2">
            {user.name} deixa de ver os dados de <strong>{user.organizationName}</strong> na hora. O que já criou lá continua lá. As permissões personalizadas
            voltam ao padrão do papel.
          </p>
          <Field label="Novo escritório" htmlFor="mu-org" className="sm:col-span-2">
            <NativeSelect id="mu-org" value={target} onChange={(e) => setTarget(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Papel no novo escritório" htmlFor="mu-role" className="sm:col-span-2">
            <NativeSelect id="mu-role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
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
        <Button type="submit" form="admin-move-user" disabled={busy || !options.length}>
          {busy ? "Movendo…" : "Mover usuário"}
        </Button>
      </ModalFooter>
    </>
  )
}

export function UsersView() {
  const params = useSearchParams()
  const router = useRouter()
  const { data, error, loading, reload } = useAdminData<{ users: AdminUser[]; organizations: OrgOption[] }>("/api/admin/users")
  const [query, setQuery] = React.useState(params.get("q") ?? "")
  const [org, setOrg] = React.useState(params.get("org") ?? "all")
  const [role, setRole] = React.useState("all")
  const [status, setStatus] = React.useState<StatusFilter>("all")
  const [dialog, setDialog] = React.useState<Dialog>(params.get("novo") === "1" ? { kind: "create" } : null)
  const [shown, setShown] = React.useState<Dialog>(dialog)
  if (dialog && dialog !== shown) setShown(dialog)
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)

  const users = React.useMemo(() => data?.users ?? [], [data])
  const orgs = data?.organizations ?? []
  const weekAgo = getNow().getTime() - 7 * 86_400_000
  const counts = {
    all: users.length,
    active: users.filter((u) => u.active && !u.invitePending).length,
    invited: users.filter((u) => u.active && u.invitePending).length,
    inactive: users.filter((u) => !u.active).length,
  }
  const recent = users.filter((u) => u.lastSignInAt && new Date(u.lastSignInAt).getTime() >= weekAgo).length

  const rows = users.filter(
    (u) =>
      (org === "all" || u.organizationId === org) &&
      (role === "all" || u.role === role) &&
      (status === "all" || (status === "active" ? u.active && !u.invitePending : status === "invited" ? u.active && u.invitePending : !u.active)) &&
      matches(query, u.name, u.email, u.organizationName, u.jobTitle),
  )

  const run = async (fn: () => Promise<unknown>, message: string, description: string) => {
    try {
      await fn()
      toast.success(message, { description })
      reload()
    } catch (err) {
      toast.error((err as Error).message)
      throw err
    }
  }

  const toggle = (u: AdminUser) => {
    if (!u.active) return void run(() => adminFetch(userUrl(u), "PATCH", { active: true }), "Usuário reativado.", u.name).catch(() => undefined)
    setConfirm({
      title: `Desativar ${u.name}?`,
      description: `A pessoa perde o acesso a ${u.organizationName} na hora. Pode ser reativada depois.`,
      confirmLabel: "Desativar",
      onConfirm: () => run(() => adminFetch(userUrl(u), "PATCH", { active: false }), "Usuário desativado.", u.name),
    })
  }
  const reset = (u: AdminUser) =>
    setConfirm({
      title: u.invitePending ? `Reenviar convite para ${u.name}?` : `Resetar o acesso de ${u.name}?`,
      description: u.invitePending
        ? `Um novo link para criar a senha vai para ${u.email}.`
        : `Um link de uso único para definir uma nova senha vai para ${u.email}. A senha atual continua valendo até ser trocada.`,
      confirmLabel: u.invitePending ? "Reenviar convite" : "Enviar link",
      tone: "default",
      onConfirm: () => run(() => adminFetch(`${userUrl(u)}/invite`, "POST"), u.invitePending ? "Convite reenviado." : "Link de nova senha enviado.", u.email),
    })
  const remove = (u: AdminUser) =>
    setConfirm({
      title: `Remover ${u.name}?`,
      description: "A conta é apagada e a pessoa perde o acesso na hora. Clientes, tarefas e documentos criados por ela continuam no escritório.",
      confirmLabel: "Remover",
      requireText: u.email,
      onConfirm: () => run(() => adminFetch(userUrl(u), "DELETE"), "Usuário removido.", u.name),
    })

  const close = (ok: boolean) => {
    setDialog(null)
    if (ok) reload()
  }
  const d = dialog ?? shown

  const menu = (u: AdminUser) => (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Ações para ${u.name}`} className={rowMenuTrigger}>
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-[10px] p-1">
        <DropdownMenuGroup>
          <DropdownMenuItem className="h-8 px-2" onClick={() => setDialog({ kind: "edit", user: u })}>
            <Pencil /> Editar / alterar cargo
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => router.push(`/admin/escritorios/${u.organizationId}?aba=usuarios`)}>
            <ShieldCheck /> Permissões
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => reset(u)} disabled={!u.active}>
            <KeyRound /> {u.invitePending ? "Reenviar convite" : "Resetar acesso"}
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => setDialog({ kind: "move", user: u })}>
            <ArrowRightLeft /> Alterar escritório
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => router.push(`/admin/atividade?actor=${u.id}`)}>
            <ScrollText /> Visualizar atividade
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="h-8 px-2" onClick={() => toggle(u)}>
            <Power /> {u.active ? "Desativar" : "Ativar"}
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => remove(u)}>
            <Trash2 /> Remover
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Operação"
        title="Usuários"
        description="Todas as pessoas de todos os escritórios — acesso, papel e último login."
        actions={
          <Button onClick={() => setDialog({ kind: "create" })} disabled={!data}>
            <UserPlus /> Criar usuário
          </Button>
        }
      />

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Usuários", counts.all],
            ["Ativos", counts.active],
            ["Convites pendentes", counts.invited],
            ["Entraram em 7 dias", recent],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[12px] border border-border bg-card px-4 py-3 shadow-card">
              <p className="text-[11.5px] text-muted-foreground">{label}</p>
              <p className="tabular mt-0.5 text-[20px] font-semibold tracking-[-0.02em]">{Number(value).toLocaleString("pt-BR")}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <FilterTabs
          ariaLabel="Status"
          layoutId="users-status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Todos", count: counts.all },
            { value: "active", label: "Ativos", count: counts.active },
            { value: "invited", label: "Convite pendente", count: counts.invited },
            { value: "inactive", label: "Inativos", count: counts.inactive },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <SearchField value={query} onChange={setQuery} placeholder="Nome, e-mail ou escritório…" className="col-span-2 sm:w-[320px]" />
          <NativeSelect aria-label="Escritório" value={org} onChange={(e) => setOrg(e.target.value)} className="sm:w-[220px]">
            <option value="all">Todos os escritórios</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Papel" value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-[200px]">
            <option value="all">Todos os papéis</option>
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {error && !data ? (
        <TableShell>
          <ErrorState onRetry={reload} description={error} />
        </TableShell>
      ) : !data ? (
        <SkeletonTable rows={8} />
      ) : rows.length === 0 ? (
        <TableShell>
          <EmptyState
            icon={<UsersRound />}
            title={users.length ? "Nenhum usuário encontrado." : "Nenhum usuário ainda."}
            description={users.length ? "Ajuste a busca ou os filtros." : "Crie o primeiro escritório — o sócio vira o primeiro usuário."}
          />
        </TableShell>
      ) : (
        <TableShell className={cn("transition-opacity max-md:hidden", loading && "opacity-60")}>
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full min-w-[960px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Escritório</Th>
                  <Th>Cargo</Th>
                  <Th>Status</Th>
                  <Th>Último acesso</Th>
                  <Th>Criado em</Th>
                  <Th className="w-10" aria-label="Ações" />
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-0">
                {rows.map((u) => {
                  const s = statusOf(u)
                  return (
                    <tr key={u.id} className={cn("transition-colors hover:bg-surface-muted/40", !u.active && "opacity-60")}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <UserAvatar name={u.name} src={u.avatarUrl} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{u.name}</p>
                            <p className="truncate text-[12px] text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Link href={`/admin/escritorios/${u.organizationId}`} className="hover:underline">
                          {u.organizationName}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge tone={u.role === "owner" ? "gold" : "neutral"} dot={false}>
                          {ROLE_LABELS[u.role]}
                        </StatusBadge>
                        {u.jobTitle && <p className="mt-1 max-w-[180px] truncate text-[11.5px] text-muted-foreground">{u.jobTitle}</p>}
                      </Td>
                      <Td>
                        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{u.lastSignInAt ? fmtRelative(u.lastSignInAt) : "Nunca entrou"}</Td>
                      <Td className="tabular whitespace-nowrap text-muted-foreground">{fmtNumericDate(u.createdAt)}</Td>
                      <Td>{menu(u)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-surface-muted/30 px-5 py-2.5 text-[12px] text-muted-foreground">
            {rows.length} de {users.length} usuários
          </div>
        </TableShell>
      )}

      {/* Cartões: celular */}
      {data && rows.length > 0 && (
        <ul className={cn("space-y-2.5 transition-opacity md:hidden", loading && "opacity-60")}>
          {rows.map((u) => {
            const s = statusOf(u)
            return (
              <li key={u.id} className={cn("rounded-[14px] border border-border bg-card p-4 shadow-card", !u.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <UserAvatar name={u.name} src={u.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{u.email}</p>
                  </div>
                  {menu(u)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={s.tone} size="sm">
                    {s.label}
                  </StatusBadge>
                  <StatusBadge tone={u.role === "owner" ? "gold" : "neutral"} dot={false} size="sm">
                    {ROLE_LABELS[u.role]}
                  </StatusBadge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-[12px] text-muted-foreground">
                  <Link href={`/admin/escritorios/${u.organizationId}`} className="truncate font-medium text-foreground hover:underline">
                    {u.organizationName}
                  </Link>
                  <span className="shrink-0">{u.lastSignInAt ? fmtRelative(u.lastSignInAt) : "Nunca entrou"}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={dialog?.kind === "create"} onOpenChange={(o) => !o && close(false)} title="Criar usuário" description="A pessoa recebe um link para criar a própria senha." icon={<UserPlus />} bare>
        <CreateForm orgs={orgs} defaultOrg={org !== "all" ? org : undefined} onDone={close} />
      </Modal>
      <Modal open={dialog?.kind === "edit"} onOpenChange={(o) => !o && close(false)} title="Editar usuário" description={d && d.kind !== "create" ? d.user.email : undefined} icon={<Pencil />} bare>
        {d?.kind === "edit" && <EditForm user={d.user} onDone={close} />}
      </Modal>
      <Modal open={dialog?.kind === "move"} onOpenChange={(o) => !o && close(false)} title="Alterar escritório" description={d && d.kind !== "create" ? d.user.name : undefined} icon={<ArrowRightLeft />} bare>
        {d?.kind === "move" && <MoveForm user={d.user} orgs={orgs} onDone={close} />}
      </Modal>
      <ConfirmAction request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
