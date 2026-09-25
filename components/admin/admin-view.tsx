"use client"

import * as React from "react"
import { Building2, CircleCheck, Ellipsis, LogOut, Plus, Power, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { Logo } from "@/components/layout/logo"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { FilterTabs } from "@/components/ui/filter-tabs"
import { SearchField } from "@/components/ui/search-field"
import { StatusBadge } from "@/components/ui/status-badge"
import { TableShell, Td, Th } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Field, NativeSelect, TextInput } from "@/components/ui/field"
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal"
import { SideSheet } from "@/components/ui/side-sheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MembersManager } from "@/components/configuracoes/members-manager"
import { getSupabase } from "@/lib/supabase/client"
import { hardNavigate } from "@/lib/auth/navigate"
import { isEmail } from "@/lib/auth/validation"
import { maskDocument } from "@/lib/masks"
import { matches } from "@/lib/format"
import { fmtNumericDate } from "@/lib/dates"
import type { Organization } from "@/types"

interface AdminOrganization extends Organization {
  memberCount: number
  activeCount: number
  owners: { name: string; email: string }[]
}

type Status = Organization["status"]
const PLANS: Organization["plan"][] = ["Essencial", "Profissional", "Escritório"]
const STATUS: Record<Status, { label: string; tone: "warning" | "success" | "neutral" }> = {
  pending: { label: "Aguardando aprovação", tone: "warning" },
  active: { label: "Ativo", tone: "success" },
  inactive: { label: "Inativo", tone: "neutral" },
}

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

function NewOfficeForm({ onDone }: { onDone: (created: boolean) => void }) {
  const [form, setForm] = React.useState({ name: "", cnpj: "", plan: "Essencial" as Organization["plan"], ownerName: "", ownerEmail: "" })
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return setError("Informe o nome do escritório.")
    if (form.ownerName.trim().length < 3) return setError("Informe o nome do sócio.")
    if (!isEmail(form.ownerEmail.trim())) return setError("E-mail do sócio inválido.")
    setError("")
    setBusy(true)
    try {
      await call("/api/admin/organizations", "POST", form)
      toast.success("Escritório criado.", { description: `${form.ownerEmail} recebeu o convite.` })
      onDone(true)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <ModalBody>
        <form id="new-office-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {error && (
            <p role="alert" className="text-[12.5px] text-danger sm:col-span-2">
              {error}
            </p>
          )}
          <Field label="Nome do escritório" htmlFor="no-name" className="sm:col-span-2">
            <TextInput id="no-name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="CNPJ" htmlFor="no-cnpj" optional>
            <TextInput id="no-cnpj" inputMode="numeric" value={form.cnpj} onChange={(e) => set("cnpj", maskDocument(e.target.value))} />
          </Field>
          <Field label="Plano" htmlFor="no-plan">
            <NativeSelect id="no-plan" value={form.plan} onChange={(e) => set("plan", e.target.value as Organization["plan"])}>
              {PLANS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Nome do Sócio/Proprietário" htmlFor="no-owner">
            <TextInput id="no-owner" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          </Field>
          <Field label="E-mail do Sócio/Proprietário" htmlFor="no-owner-email">
            <TextInput id="no-owner-email" type="email" value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
          </Field>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => onDone(false)}>
          Cancelar
        </Button>
        <Button type="submit" form="new-office-form" disabled={busy}>
          {busy ? "Criando…" : "Criar e convidar"}
        </Button>
      </ModalFooter>
    </>
  )
}

/**
 * Painel do Super Admin: escritórios (aprovar, ativar/desativar, plano) e os usuários
 * de cada um. Não mostra dados jurídicos — a RLS nem os entrega ao Super Admin.
 */
export function AdminView() {
  const [orgs, setOrgs] = React.useState<AdminOrganization[] | null>(null)
  const [loadError, setLoadError] = React.useState(false)
  const [filter, setFilter] = React.useState<Status>("pending")
  const [query, setQuery] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [managing, setManaging] = React.useState<AdminOrganization | null>(null)
  const [shownManaging, setShownManaging] = React.useState<AdminOrganization | null>(null)
  if (managing && managing !== shownManaging) setShownManaging(managing)
  const [deactivating, setDeactivating] = React.useState<AdminOrganization | null>(null)

  const load = React.useCallback(async () => {
    try {
      const { organizations } = await call<{ organizations: AdminOrganization[] }>("/api/admin/organizations", "GET")
      setOrgs(organizations)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  React.useEffect(() => {
    // Busca inicial da lista no servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const update = async (org: AdminOrganization, patch: { status?: Status; plan?: Organization["plan"] }, message: string) => {
    try {
      await call(`/api/admin/organizations/${org.id}`, "PATCH", patch)
      toast.success(message, { description: org.name })
      load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const signOut = async () => {
    await getSupabase().auth.signOut()
    hardNavigate("/login")
  }

  const counts = { pending: 0, active: 0, inactive: 0 }
  orgs?.forEach((o) => counts[o.status]++)
  const rows = (orgs ?? []).filter((o) => o.status === filter && matches(query, o.name, o.cnpj, ...o.owners.flatMap((w) => [w.name, w.email])))
  const sheetOrg = managing ?? shownManaging

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-[60px] max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo subtitle="Super Admin" />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut /> Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] space-y-6 px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <PageHeader
          title="Escritórios"
          description="Aprove cadastros, ative ou desative escritórios e gerencie seus usuários."
          actions={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Novo escritório
            </Button>
          }
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterTabs
            ariaLabel="Filtrar escritórios"
            layoutId="admin-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "Pendentes", count: counts.pending },
              { value: "active", label: "Ativos", count: counts.active },
              { value: "inactive", label: "Inativos", count: counts.inactive },
            ]}
          />
          <SearchField value={query} onChange={setQuery} placeholder="Escritório, CNPJ ou sócio…" className="w-full lg:w-[300px]" />
        </div>

        {loadError ? (
          <TableShell>
            <EmptyState
              icon={<Building2 />}
              title="Não foi possível carregar os escritórios."
              action={
                <Button size="sm" variant="secondary" onClick={load}>
                  Tentar de novo
                </Button>
              }
            />
          </TableShell>
        ) : !orgs ? (
          <SkeletonTable />
        ) : rows.length === 0 ? (
          <TableShell>
            <EmptyState
              icon={<Building2 />}
              title={filter === "pending" ? "Nenhum cadastro aguardando aprovação." : "Nenhum escritório aqui."}
              description={query ? `Nada corresponde a “${query}”.` : undefined}
            />
          </TableShell>
        ) : (
          <TableShell>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <Th>Escritório</Th>
                    <Th>Sócio(s)</Th>
                    <Th className="text-center">Usuários</Th>
                    <Th>Plano</Th>
                    <Th>Status</Th>
                    <Th>Cadastro</Th>
                    <Th className="w-10" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child_td]:border-0">
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <Td>
                        <p className="font-medium">{o.name}</p>
                        {o.cnpj && <p className="text-[12px] text-muted-foreground">CNPJ {o.cnpj}</p>}
                      </Td>
                      <Td>
                        {o.owners.length ? (
                          o.owners.map((w) => (
                            <p key={w.email} className="truncate text-[12.5px]">
                              {w.name} <span className="text-muted-foreground">· {w.email}</span>
                            </p>
                          ))
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </Td>
                      <Td className="tabular text-center text-muted-foreground">
                        {o.activeCount}/{o.memberCount}
                      </Td>
                      <Td className="text-muted-foreground">{o.plan}</Td>
                      <Td>
                        <StatusBadge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</StatusBadge>
                      </Td>
                      <Td className="tabular whitespace-nowrap text-muted-foreground">{fmtNumericDate(o.createdAt)}</Td>
                      <Td>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Ações para ${o.name}`}
                            className="flex size-8 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-accent"
                          >
                            <Ellipsis className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 rounded-[10px] p-1">
                            <DropdownMenuGroup>
                              {o.status !== "active" && (
                                <DropdownMenuItem
                                  className="h-8 px-2"
                                  onClick={() =>
                                    update(o, { status: "active" }, o.status === "pending" ? "Escritório aprovado." : "Escritório reativado.")
                                  }
                                >
                                  <CircleCheck /> {o.status === "pending" ? "Aprovar" : "Reativar"}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="h-8 px-2" onClick={() => setManaging(o)}>
                                <UsersRound /> Gerenciar usuários
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                              <DropdownMenuLabel className="px-2 py-1 text-[11px]">Plano</DropdownMenuLabel>
                              <DropdownMenuRadioGroup
                                value={o.plan}
                                onValueChange={(plan) => update(o, { plan: plan as Organization["plan"] }, `Plano alterado para ${plan}.`)}
                              >
                                {PLANS.map((p) => (
                                  <DropdownMenuRadioItem key={p} value={p} className="h-8 px-2">
                                    {p}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuGroup>
                            {o.status !== "inactive" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="h-8 px-2" variant="destructive" onClick={() => setDeactivating(o)}>
                                  <Power /> {o.status === "pending" ? "Recusar cadastro" : "Desativar"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableShell>
        )}
      </main>

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="Novo escritório"
        description="O escritório já nasce ativo e o sócio recebe um convite para criar a senha."
        icon={<Building2 />}
        bare
      >
        <NewOfficeForm
          onDone={(created) => {
            setCreating(false)
            if (created) load()
          }}
        />
      </Modal>

      <SideSheet
        open={!!managing}
        onOpenChange={(o) => {
          if (!o) {
            setManaging(null)
            load()
          }
        }}
        title={`Usuários de ${sheetOrg?.name ?? ""}`}
        className="sm:w-[min(960px,calc(100vw-1rem))]"
        header={
          <div className="border-b border-border px-5 pt-5 pb-4 pr-14">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gold-dark">Usuários</p>
            <h2 className="mt-1 text-[18px] font-semibold">{sheetOrg?.name}</h2>
          </div>
        }
      >
        <div className="p-4">
          {sheetOrg && <MembersManager key={sheetOrg.id} apiBase={`/api/admin/organizations/${sheetOrg.id}/users`} title="Equipe" />}
        </div>
      </SideSheet>

      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title={`${deactivating?.status === "pending" ? "Recusar" : "Desativar"} ${deactivating?.name ?? ""}?`}
        description="Todos os usuários deste escritório perdem o acesso na hora. Os dados ficam guardados e o escritório pode ser reativado depois."
        confirmLabel={deactivating?.status === "pending" ? "Recusar" : "Desativar"}
        onConfirm={() => deactivating && update(deactivating, { status: "inactive" }, "Escritório desativado.")}
      />
    </div>
  )
}
