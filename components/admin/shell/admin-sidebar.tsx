"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeftRight, Wrench } from "lucide-react"
import { cn } from "cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ADMIN_NAV, isAdminActive } from "./nav"
import { useAdminShell } from "./admin-context"

export function AdminMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-gold/35 bg-[#0e0e0d] shadow-[0_0_0_3px_rgb(196_162_116/0.08)]",
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-full">
        <path d="M11 8.5v15h10" fill="none" stroke="#C4A274" strokeWidth="2.4" strokeLinecap="square" />
        <path d="M16 8.5h5" fill="none" stroke="#C4A274" strokeWidth="1.2" strokeLinecap="square" opacity="0.55" />
      </svg>
    </span>
  )
}

export function AdminBrand({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <AdminMark />
      {!compact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold tracking-[0.2em] text-admin-rail-foreground">LEXA</span>
            <span className="rounded-[5px] border border-gold/40 bg-gold/15 px-1.5 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#d8bb90]">
              Admin
            </span>
          </span>
          <span className="mt-1.5 text-[10.5px] tracking-[0.02em] text-admin-rail-muted">Centro de controle</span>
        </span>
      )}
    </span>
  )
}

/**
 * Navegação do Admin. `rail` = só ícones (tablet); `full` = com rótulos (desktop e gaveta).
 */
export function AdminNav({ variant, onNavigate }: { variant: "rail" | "full"; onNavigate?: () => void }) {
  const pathname = usePathname()
  const { badges } = useAdminShell()
  const rail = variant === "rail"

  return (
    <nav aria-label="Navegação do Admin" className="flex flex-col gap-5">
      {ADMIN_NAV.map((section) => (
        <div key={section.label}>
          {rail ? (
            <div className="mx-auto mb-2 h-px w-6 bg-admin-rail-border" aria-hidden />
          ) : (
            <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-admin-rail-subtle">{section.label}</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isAdminActive(pathname, item.href)
              const badge = item.badge ? badges[item.badge] : 0
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={rail ? `${item.label}${badge ? ` (${badge})` : ""}` : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/50",
                    rail && "justify-center px-0",
                    active ? "text-admin-rail-foreground" : "text-admin-rail-muted hover:bg-admin-rail-accent/70 hover:text-admin-rail-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={`admin-nav-${variant}${onNavigate ? "-drawer" : ""}`}
                      transition={{ type: "spring", stiffness: 520, damping: 42 }}
                      className="absolute inset-0 rounded-[9px] border border-admin-rail-border bg-admin-rail-accent"
                    />
                  )}
                  {active && <span aria-hidden className="absolute top-1/2 -left-3 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-gold" />}
                  <item.icon
                    className={cn("relative size-[17px] shrink-0", active ? "text-gold" : "text-admin-rail-subtle group-hover:text-admin-rail-foreground")}
                    strokeWidth={1.8}
                  />
                  {!rail && <span className="relative flex-1 truncate">{item.label}</span>}
                  {badge > 0 &&
                    (rail ? (
                      <span className="absolute top-1 right-1.5 size-2 rounded-full bg-gold ring-2 ring-admin-rail" aria-hidden />
                    ) : (
                      <span
                        className={cn(
                          "relative tabular min-w-5 rounded-full px-1.5 py-px text-center text-[10.5px] font-semibold",
                          item.badge === "pending" ? "bg-gold text-[#171717]" : "bg-danger/85 text-white",
                        )}
                      >
                        {badge}
                      </span>
                    ))}
                </Link>
              )
              return (
                <li key={item.href}>
                  {rail ? (
                    <Tooltip>
                      <TooltipTrigger render={link} />
                      <TooltipContent side="right" sideOffset={10}>
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function MaintenanceNote({ compact }: { compact?: boolean }) {
  const { maintenance } = useAdminShell()
  if (!maintenance) return null
  return (
    <Link
      href="/admin/configuracoes#manutencao"
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] border border-warning/30 bg-warning/10 text-[12px] text-[#e3bd78] outline-none transition-colors hover:bg-warning/15 focus-visible:ring-2 focus-visible:ring-gold/50",
        compact ? "size-9 justify-center" : "px-3 py-2.5",
      )}
      aria-label="Modo manutenção ligado"
    >
      <Wrench className="size-4 shrink-0" />
      {!compact && (
        <span className="leading-snug">
          <span className="block font-medium">Manutenção ligada</span>
          <span className="block text-[11px] opacity-80">Escritórios sem acesso</span>
        </span>
      )}
    </Link>
  )
}

export function BackToCrm({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <a
      href="/dashboard?de=admin"
      onClick={onNavigate}
      aria-label="Voltar ao CRM"
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-[9px] text-[12.5px] font-medium text-admin-rail-muted outline-none transition-colors hover:bg-admin-rail-accent/70 hover:text-admin-rail-foreground focus-visible:ring-2 focus-visible:ring-gold/50",
        compact ? "w-9 justify-center" : "px-2.5",
      )}
    >
      <ArrowLeftRight className="size-4 shrink-0" />
      {!compact && "Voltar ao CRM"}
    </a>
  )
}

export function AdminSidebar() {
  return (
    <aside
      aria-label="Barra lateral do Admin"
      className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col border-r border-admin-rail-border bg-admin-rail text-admin-rail-foreground md:flex lg:w-[256px]"
    >
      <div className="flex h-[64px] shrink-0 items-center justify-center px-4 lg:justify-start">
        <Link href="/admin" aria-label="Lexa Admin — dashboard" className="rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
          <span className="lg:hidden">
            <AdminMark />
          </span>
          <span className="max-lg:hidden">
            <AdminBrand />
          </span>
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-3 no-scrollbar">
        <div className="lg:hidden">
          <AdminNav variant="rail" />
        </div>
        <div className="max-lg:hidden">
          <AdminNav variant="full" />
        </div>
      </div>
      <div className="shrink-0 space-y-2 border-t border-admin-rail-border p-3">
        <div className="flex justify-center lg:hidden">
          <MaintenanceNote compact />
        </div>
        <div className="max-lg:hidden">
          <MaintenanceNote />
        </div>
        <div className="flex justify-center lg:block">
          <span className="lg:hidden">
            <BackToCrm compact />
          </span>
          <span className="max-lg:hidden">
            <BackToCrm />
          </span>
        </div>
      </div>
    </aside>
  )
}
