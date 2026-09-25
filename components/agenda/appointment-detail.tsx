"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, CalendarDays, Clock3, MapPin, StickyNote, Trash2, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Modal } from "@/components/ui/modal"
import { Button, buttonVariants } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useCategoryLookup } from "./use-category"
import { fmtFullDate, fmtTime, parse } from "@/lib/dates"
import { getUser } from "@/lib/account"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import type { Appointment } from "@/types"
import { Can } from "@/lib/auth/session"

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 text-subtle [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1 text-[13.5px]">{children}</div>
    </div>
  )
}

export function AppointmentDetail({ appointment, onClose }: { appointment?: Appointment; onClose: () => void }) {
  const data = useDemoData()
  const { deleteAppointment } = useDemoActions()
  const lookup = useCategoryLookup()
  const [shown, setShown] = React.useState(appointment)
  const [deleting, setDeleting] = React.useState(false)
  if (appointment && appointment !== shown) setShown(appointment)
  const a = appointment ?? shown
  if (!a) return null

  const { category, style } = lookup(a.categoryId)
  const owner = getUser(a.ownerId)
  const process = data.processes.find((p) => p.id === a.processId)
  const client = data.clients.find((c) => c.id === a.clientId)

  return (
    <Modal
      open={!!appointment}
      onOpenChange={(o) => !o && onClose()}
      title={a.title}
      description={a.personName}
      size="sm"
      icon={<span className="size-2.5 rounded-full" style={style.dot} />}
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
          </Can>
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
              toast.success("Lembrete enviado.", { description: `${a.personName ?? "Participantes"} receberá a confirmação por WhatsApp.` })
            }}
          >
            Enviar lembrete
          </Button>
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
      <div className="-mt-1">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {category && (
            <span
              className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium"
              style={{ ...style.soft, ...style.text }}
            >
              <span className="size-1.5 rounded-full" style={style.dot} />
              {category.name}
            </span>
          )}
          {a.area && <StatusBadge dot={false}>{a.area}</StatusBadge>}
        </div>
        <Row icon={<CalendarDays />}>{fmtFullDate(parse(a.start))}</Row>
        <Row icon={<Clock3 />}>
          <span className="tabular">
            {fmtTime(a.start)} – {fmtTime(a.end)}
          </span>
        </Row>
        {a.location && <Row icon={<MapPin />}>{a.location}</Row>}
        <Row icon={<UserRound />}>
          <span className="inline-flex items-center gap-1.5">
            <UserAvatar name={owner.name} size="xs" /> {owner.name}
          </span>
        </Row>
        {process && (
          <Row icon={<span className="font-mono text-[10px] font-bold">#</span>}>
            <span className="font-mono text-[12.5px]">{process.number}</span>
          </Row>
        )}
        {a.notes && (
          <Row icon={<StickyNote />}>
            <span className="text-muted-foreground">{a.notes}</span>
          </Row>
        )}
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir "${a.title}"?`}
        description="Esta ação não pode ser desfeita."
        onConfirm={() => {
          deleteAppointment(a.id)
          toast.success("Compromisso excluído.", { description: a.title })
          onClose()
        }}
      />
    </Modal>
  )
}
