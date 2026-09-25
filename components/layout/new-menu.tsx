"use client"

import { CalendarPlus, ChevronDown, FilePlus, ListChecks, Plus, Scale, UsersRound } from "lucide-react"
import { cn } from "cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buttonVariants } from "@/components/ui/button"
import { DIALOG_PERMISSION, useUI, type DialogKind } from "@/lib/store/ui-store"
import { useSession } from "@/lib/auth/session"

const ITEMS: { kind: DialogKind; label: string; description: string; icon: React.ElementType }[] = [
  { kind: "process", label: "Novo processo", description: "Consultar pelo CNJ e salvar", icon: Scale },
  { kind: "client", label: "Novo cliente", description: "Cadastrar cliente do escritório", icon: UsersRound },
  { kind: "task", label: "Nova tarefa", description: "Atribuir uma atividade ou prazo", icon: ListChecks },
  { kind: "appointment", label: "Novo compromisso", description: "Consulta, audiência ou reunião", icon: CalendarPlus },
]

export function NewMenu({ compact }: { compact?: boolean }) {
  const { openDialog } = useUI()
  const { can } = useSession()
  const items = ITEMS.filter((item) => can(DIALOG_PERMISSION[item.kind]))
  const canDocument = can(DIALOG_PERMISSION.document)
  if (!items.length && !canDocument) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Criar novo" className={cn(buttonVariants({ size: compact ? "icon" : "default" }), !compact && "pr-2.5")}>
        <Plus className="size-4" />
        {!compact && (
          <>
            <span>Novo</span>
            <ChevronDown className="size-3.5 opacity-60" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-[12px] p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-[11px] uppercase tracking-[0.08em]">Criar</DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuItem key={item.kind} className="gap-3 rounded-[8px] px-2 py-2" onClick={() => openDialog(item.kind)}>
              <span className="flex size-8 items-center justify-center rounded-[8px] border border-border bg-surface text-foreground">
                <item.icon className="size-4" />
              </span>
              <span className="flex flex-col">
                <span className="text-[13px] font-medium">{item.label}</span>
                <span className="text-[11.5px] text-muted-foreground">{item.description}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {canDocument && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-3 rounded-[8px] px-2 py-1.5 text-muted-foreground" onClick={() => openDialog("document")}>
                <FilePlus className="ml-2 size-4" />
                <span className="ml-1 text-[12.5px]">Adicionar documento</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
