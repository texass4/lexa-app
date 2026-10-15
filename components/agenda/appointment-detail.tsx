"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  Building2,
  CalendarCheck2,
  CalendarX2,
  ChevronDown,
  CircleDashed,
  Flag,
  MapPin,
  Pencil,
  Repeat,
  Scale,
  StickyNote,
  Trash2,
  Video,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import { Modal } from "@/components/ui/modal"
import { Button, buttonVariants } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useCategoryLookup } from "./use-category"
import { NewAppointmentDialog } from "./new-appointment-dialog"
import { appointmentStatus, participantsOf, STATUS_LABEL, videoProvider } from "@/lib/agenda/agenda"
import { fmtFullDate, fmtTime, parse } from "@/lib/core/dates"
import { getUser } from "@/lib/auth/account"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { byId } from "@/lib/store/indexes"
import type { Appointment, AppointmentStatus } from "@/types"
import { Can, useSession } from "@/lib/auth/session"
import { processSubject } from "@/lib/processos/label"

function Section({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

const STATUS_ICON: Record<AppointmentStatus, React.ReactNode> = {
  planejado: <CircleDashed className="size-4" />,
  realizado: <CalendarCheck2 className="size-4 text-success" />,
  cancelado: <CalendarX2 className="size-4 text-danger" />,
}

/** Situação com troca rápida (planejado, realizado, cancelado) para quem pode editar a agenda. */
function StatusPill({ appointment }: { appointment: Appointment }) {
  const { updateAppointment, versionOf } = useOfficeActions()
  const { can } = useSession()
  const status = appointmentStatus(appointment)
  const pill = "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground"
  if (!can("agenda.edit"))
    return (
      <span className={pill}>
        {STATUS_ICON[status]} {STATUS_LABEL[status]}
      </span>
    )
  const set = async (next: AppointmentStatus) => {
    if (next === status) return
    const result = await updateAppointment(
      appointment.id,
      { status: next === "planejado" ? undefined : next },
      { baseVersion: versionOf("appointments", appointment.id) },
    )
    if (result.status === "saved")
      toast.success(next === "planejado" ? "Compromisso reaberto." : `Marcado como ${next}.`, { description: appointment.title })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(pill, "outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand/40")}
        aria-label={`Situação: ${STATUS_LABEL[status]}. Alterar`}
      >
        {STATUS_ICON[status]} {STATUS_LABEL[status]} <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {(["planejado", "realizado", "cancelado"] as const).map((s) => (
          <DropdownMenuItem key={s} className="h-8 gap-2 px-2" onClick={() => void set(s)}>
            {STATUS_ICON[s]} {STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppointmentDetail({ appointment, onClose }: { appointment?: Appointment; onClose: () => void }) {
  const data = useOfficeData()
  const { deleteAppointment, deleteAppointments } = useOfficeActions()
  const lookup = useCategoryLookup()
  const [shown, setShown] = React.useState(appointment)
  const [deleting, setDeleting] = React.useState(false)
  const [scope, setScope] = React.useState<"this" | "following">("this")
  // Edição: o detalhe fecha e o formulário abre com o compromisso atual (pode ter mudado pelo tempo real).
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const editing = editingId ? data.appointments.find((x) => x.id === editingId) : undefined
  if (appointment && appointment !== shown) setShown(appointment)
  // Sempre a versão atual do store (a situação muda com o detalhe aberto).
  const base = appointment ?? shown
  const a = (base && data.appointments.find((x) => x.id === base.id)) ?? base
  if (!a) return null

  const { category, style } = lookup(a.categoryId)
  const process = byId(data.processes, a.processId)
  const client = byId(data.clients, a.clientId)
  const status = appointmentStatus(a)
  const people = participantsOf(a)
  const following = a.seriesId ? data.appointments.filter((x) => x.seriesId === a.seriesId && x.start >= a.start) : []

  return (
    <>
      <Modal
        open={!!appointment}
        onOpenChange={(o) => !o && onClose()}
        title={a.title}
        description={category ? `${category.name}${a.area ? ` · ${a.area}` : ""}` : a.area}
        size="sm"
        icon={<span className="size-3 rounded-full" style={style.dot} />}
        footer={
          <>
            <Can permission="agenda.edit">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Excluir compromisso"
                className="text-danger hover:bg-danger-soft"
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingId(a.id)
                  onClose()
                }}
              >
                <Pencil /> Editar
              </Button>
            </Can>
            {process ? (
              <Link href={`/processos/${process.id}`} className={buttonVariants()} onClick={onClose}>
                Abrir processo <ArrowUpRight />
              </Link>
            ) : client ? (
              <Link href={`/clientes/${client.id}`} className={buttonVariants()} onClick={onClose}>
                Abrir cliente <ArrowUpRight />
              </Link>
            ) : null}
          </>
        }
      >
        <div className="-mt-1 divide-y divide-border/70">
          <div className="pb-3">
            {(client || process) && (
              <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                {client && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="size-3.5" /> {client.name}
                  </span>
                )}
                {process && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Scale className="size-3.5 shrink-0" /> <span className="truncate">{processSubject(process)}</span>
                  </span>
                )}
              </p>
            )}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {a.priority === "alta" && (
                <StatusBadge tone="danger" dot={false}>
                  <Flag className="size-3 fill-current" /> Prioridade alta
                </StatusBadge>
              )}
              {a.seriesId && (
                <StatusBadge dot={false}>
                  <Repeat className="size-3" /> Faz parte de uma série
                </StatusBadge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill appointment={a} />
            </div>
          </div>

          <Section label="Quando">
            <p className="text-[14px] font-semibold">
              {fmtFullDate(parse(a.start))} <span className="text-subtle">▪</span>{" "}
              <span className="tabular whitespace-nowrap">
                {fmtTime(a.start)} – {fmtTime(a.end)}
              </span>
            </p>
            {status !== "planejado" && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{STATUS_LABEL[status]}</p>}
          </Section>

          {a.videoUrl && (
            <Section label="Videochamada">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2 text-[14px] font-semibold">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-brand-soft text-brand">
                    <Video className="size-4" />
                  </span>
                  <span className="truncate">{videoProvider(a.videoUrl)}</span>
                </span>
                <a
                  href={a.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-semibold text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  <Video className="size-3.5" /> Conectar
                </a>
              </div>
            </Section>
          )}

          {a.location && (
            <Section label="Local">
              <p className="flex items-start gap-2 text-[13.5px]">
                <MapPin className="mt-0.5 size-4 shrink-0 text-subtle" /> {a.location}
              </p>
            </Section>
          )}

          <Section label={people.length > 1 ? "Participantes" : "Responsável"}>
            <ul className="space-y-1.5">
              {people.map((id) => {
                const user = getUser(id)
                return (
                  <li key={id} className="flex items-center gap-2.5 text-[13.5px]">
                    <UserAvatar name={user.name} src={user.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1 truncate font-medium">{user.name}</span>
                    {id === a.ownerId && people.length > 1 && <span className="text-[11.5px] text-subtle">Responsável</span>}
                  </li>
                )
              })}
            </ul>
          </Section>

          {a.notes && (
            <Section label="Descrição">
              <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-muted-foreground">
                <StickyNote className="mt-0.5 size-4 shrink-0 text-subtle" /> <span className="whitespace-pre-wrap">{a.notes}</span>
              </p>
            </Section>
          )}
        </div>
        <ConfirmDialog
          open={deleting}
          onOpenChange={(o) => {
            setDeleting(o)
            if (!o) setScope("this")
          }}
          title={`Excluir "${a.title}"?`}
          description="Esta ação não pode ser desfeita."
          onConfirm={() => {
            if (scope === "following" && following.length > 1) {
              deleteAppointments(following.map((x) => x.id))
              toast.success(`${following.length} compromissos excluídos.`, { description: a.title })
            } else {
              deleteAppointment(a.id)
              toast.success("Compromisso excluído.", { description: a.title })
            }
            onClose()
          }}
        >
          {following.length > 1 && (
            <div role="radiogroup" aria-label="O que excluir" className="mt-3 space-y-1.5 text-[13px]">
              {(
                [
                  ["this", "Somente este compromisso"],
                  ["following", `Este e os próximos da série (${following.length})`],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="delete-scope"
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="size-4 accent-[var(--danger)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </ConfirmDialog>
      </Modal>
      {/* Fora do detalhe: ele fecha ao abrir a edição. */}
      <NewAppointmentDialog open={!!editing} onOpenChange={(o) => !o && setEditingId(null)} appointment={editing} />
    </>
  )
}
