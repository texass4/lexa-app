"use client"

import { useRouter } from "next/navigation"
import { Bell, CalendarClock, FileText, Hourglass, Signature, CheckCheck } from "lucide-react"
import { cn } from "cn"
import * as React from "react"
import Link from "next/link"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SignalList } from "@/components/shared/signal-list"
import { officeSignals } from "@/lib/attention"
import { useSession } from "@/lib/auth/session"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { fmtRelative } from "@/lib/dates"
import type { Notification } from "@/types"

const ICONS: Record<Notification["type"], { icon: React.ElementType; cls: string }> = {
  deadline: { icon: Hourglass, cls: "text-danger bg-danger-soft" },
  document: { icon: FileText, cls: "text-info bg-info-soft" },
  appointment: { icon: CalendarClock, cls: "text-violet bg-violet-soft" },
  contract: { icon: Signature, cls: "text-success bg-success-soft" },
}

export function NotificationsMenu() {
  const data = useDemoData()
  const { notifications } = data
  const { markAllNotificationsRead, markNotificationRead } = useDemoActions()
  const { can, user } = useSession()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const unread = notifications.filter((n) => !n.read).length
  // "Precisa de atenção": os mesmos sinais do painel, só os urgentes e os de verificar.
  const urgent = data.hydrated ? officeSignals(data, { userId: user.id, can }).filter((s) => s.level === "critical" || s.level === "warning") : []
  const critical = urgent.filter((s) => s.level === "critical").length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={
          [unread && `${unread} não lidas`, critical && `${critical} pede${critical > 1 ? "m" : ""} atenção`].filter(Boolean).join(" · ")
            ? `Notificações — ${[unread && `${unread} não lidas`, critical && `${critical} pede${critical > 1 ? "m" : ""} atenção`].filter(Boolean).join(" · ")}`
            : "Notificações"
        }
        className="relative flex size-9 items-center justify-center rounded-[9px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/45 aria-expanded:bg-accent aria-expanded:text-foreground"
      >
        <Bell className="size-[18px]" strokeWidth={1.8} />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-gold text-[9.5px] font-semibold text-white ring-2 ring-background">
            {unread}
          </span>
        ) : (
          critical > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-background" aria-hidden />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(380px,calc(100vw-24px))] gap-0 rounded-[14px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold">Notificações</p>
            <p className="text-[12px] text-muted-foreground">
              {unread
                ? `${unread} não lidas`
                : urgent.length
                  ? `${urgent.length} ponto${urgent.length > 1 ? "s" : ""} para acompanhar`
                  : "Tudo em dia"}
            </p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[12px] font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              <CheckCheck className="size-3.5" /> Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-[440px] overflow-y-auto thin-scrollbar">
          {urgent.length > 0 && (
            <div className="border-b border-border px-1.5 pt-2 pb-1.5">
              <p className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-subtle">Precisa de atenção</p>
              {/* Seguir um sinal (ou criar a tarefa dele) fecha o menu. */}
              <div onClick={(e) => (e.target as HTMLElement).closest("a, button") && setOpen(false)}>
                <SignalList signals={urgent.slice(0, 5)} dense />
              </div>
              {urgent.length > 5 && (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2.5 py-1 text-[12px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40"
                >
                  Ver todos no painel ({urgent.length})
                </Link>
              )}
            </div>
          )}
          {notifications.length === 0 && urgent.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className="text-[13.5px] font-medium">Nada novo por aqui.</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Prazos próximos, tarefas atrasadas e movimentações que pedem revisão aparecem aqui.
              </p>
            </div>
          )}
          <ul className={cn("p-1.5", notifications.length === 0 && "hidden")}>
            {notifications.map((n) => {
              const cfg = ICONS[n.type]
              const Icon = cfg.icon
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markNotificationRead(n.id)
                      setOpen(false)
                      router.push(n.href)
                    }}
                    className="flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                  >
                    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px]", cfg.cls)}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate text-[13px]", n.read ? "font-medium text-muted-foreground" : "font-semibold text-foreground")}>
                          {n.title}
                        </span>
                        {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-gold" aria-label="Não lida" />}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{n.description}</span>
                      <span className="mt-1 block text-[11px] text-subtle">{fmtRelative(n.at)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}
