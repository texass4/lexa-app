"use client"

import { useRouter } from "next/navigation"
import { Bell, CalendarClock, FileText, Hourglass, Signature, CheckCheck } from "lucide-react"
import { cn } from "cn"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
  const { notifications } = useDemoData()
  const { markAllNotificationsRead, markNotificationRead } = useDemoActions()
  const router = useRouter()
  const unread = notifications.filter((n) => !n.read).length

  return (
    <Popover>
      <PopoverTrigger
        aria-label={unread ? `Notificações — ${unread} não lidas` : "Notificações"}
        className="relative flex size-9 items-center justify-center rounded-[9px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/45 aria-expanded:bg-accent aria-expanded:text-foreground"
      >
        <Bell className="size-[18px]" strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-gold text-[9.5px] font-semibold text-white ring-2 ring-background">
            {unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(380px,calc(100vw-24px))] gap-0 rounded-[14px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold">Notificações</p>
            <p className="text-[12px] text-muted-foreground">{unread ? `${unread} não lidas` : "Tudo em dia"}</p>
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
        <ul className="max-h-[420px] overflow-y-auto p-1.5 thin-scrollbar">
          {notifications.map((n) => {
            const cfg = ICONS[n.type]
            const Icon = cfg.icon
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    markNotificationRead(n.id)
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
      </PopoverContent>
    </Popover>
  )
}
