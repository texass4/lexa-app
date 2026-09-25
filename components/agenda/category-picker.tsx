"use client"

import * as React from "react"
import { Check, Pencil, Plus, Trash2 } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CATEGORY_COLORS, categoryStyle } from "@/lib/config"
import { fold } from "@/lib/format"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import type { AppointmentCategory } from "@/types"

const MAX_NAME = 40

/** Próxima cor da paleta que ainda não está em uso — categorias novas nascem diferentes. */
function nextColor(categories: AppointmentCategory[]) {
  const used = new Set(categories.map((c) => c.color))
  return (CATEGORY_COLORS.find((c) => !used.has(c.value)) ?? CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]).value
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          aria-label={c.name}
          title={c.name}
          onClick={() => onChange(c.value)}
          className="flex size-6 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-popover transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-gold/50"
          style={{ backgroundColor: c.value }}
        >
          {value === c.value && <Check className="size-3.5 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  )
}

/** Chip de categoria — mesmo desenho dos chips de escolha do LEXA, com a cor da categoria. */
function CategoryChip({ category, active, onClick }: { category: AppointmentCategory; active: boolean; onClick: () => void }) {
  const style = categoryStyle(category.color)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px] font-medium outline-none transition-[background-color,border-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-gold/40",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={style.dot} />
      <span className="truncate">{category.name}</span>
    </button>
  )
}

function CreateCategory({ onCreated }: { onCreated: (category: AppointmentCategory) => void }) {
  const { appointmentCategories } = useDemoData()
  const { addAppointmentCategory } = useDemoActions()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState(() => nextColor(appointmentCategories))

  const create = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    // Nome repetido seleciona a categoria que já existe, em vez de duplicar.
    const existing = appointmentCategories.find((c) => fold(c.name) === fold(trimmed))
    onCreated(existing ?? addAppointmentCategory({ name: trimmed, color }))
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setName("")
          setColor(nextColor(appointmentCategories))
        }
      }}
    >
      <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-dashed border-border-strong px-2.5 text-[12.5px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40">
        <Plus className="size-3.5" /> Nova categoria
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3 p-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <TextInput autoFocus placeholder="Ex.: Audiência" maxLength={MAX_NAME} aria-label="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} />
          <ColorSwatches value={color} onChange={setColor} />
          <Button type="submit" size="sm" className="w-full" disabled={!name.trim()}>
            Criar categoria
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function CategoryRow({ category, usage }: { category: AppointmentCategory; usage: number }) {
  const { updateAppointmentCategory, deleteAppointmentCategory } = useDemoActions()
  const [name, setName] = React.useState(category.name)
  const [editingColor, setEditingColor] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== category.name) updateAppointmentCategory(category.id, { name: trimmed })
    else setName(category.name)
  }

  return (
    <li className="space-y-2 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Cor de ${category.name}`}
          aria-expanded={editingColor}
          onClick={() => setEditingColor((v) => !v)}
          className="size-5 shrink-0 rounded-full outline-none ring-offset-2 ring-offset-popover focus-visible:ring-2 focus-visible:ring-gold/50"
          style={{ backgroundColor: category.color }}
        />
        <TextInput
          aria-label="Nome da categoria"
          className="h-8 flex-1"
          maxLength={MAX_NAME}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
        />
        <button
          type="button"
          aria-label={`Excluir ${category.name}`}
          onClick={() => setConfirming((v) => !v)}
          className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {editingColor && (
        <div className="pl-7">
          <ColorSwatches
            value={category.color}
            onChange={(color) => {
              updateAppointmentCategory(category.id, { color })
              setEditingColor(false)
            }}
          />
        </div>
      )}
      {confirming && (
        <div className="flex items-center justify-between gap-2 rounded-[8px] bg-danger-soft/60 px-2.5 py-2 pl-7">
          <p className="text-[12px] leading-snug text-muted-foreground">
            {usage ? `${usage} compromisso(s) ficarão sem categoria.` : "Excluir esta categoria?"}
          </p>
          <Button type="button" size="sm" variant="secondary" className="shrink-0 text-danger" onClick={() => deleteAppointmentCategory(category.id)}>
            Excluir
          </Button>
        </div>
      )}
    </li>
  )
}

function ManageCategories() {
  const { appointmentCategories, appointments } = useDemoData()
  const usage = React.useMemo(() => {
    const count = new Map<string, number>()
    for (const a of appointments) if (a.categoryId) count.set(a.categoryId, (count.get(a.categoryId) ?? 0) + 1)
    return count
  }, [appointments])

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[12.5px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40">
        <Pencil className="size-3.5" /> Editar
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-1 p-3">
        <p className="text-[12.5px] font-medium">Categorias</p>
        <p className="text-[11.5px] text-muted-foreground">Renomeie, troque a cor ou exclua.</p>
        <ul className="-mb-1 max-h-72 divide-y divide-border overflow-y-auto thin-scrollbar">
          {appointmentCategories.map((c) => (
            <CategoryRow key={c.id} category={c} usage={usage.get(c.id) ?? 0} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Categoria do compromisso, criada pelo próprio escritório (estilo Notion):
 * escolha entre as existentes, crie uma nova na hora ou edite as que já existem.
 * Clicar na categoria selecionada desmarca — compromisso sem categoria é válido.
 */
export function CategoryPicker({ value, onChange }: { value?: string; onChange: (categoryId?: string) => void }) {
  const { appointmentCategories } = useDemoData()

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
          Categoria <span className="font-normal text-subtle">opcional</span>
        </span>
        {appointmentCategories.length > 0 && <ManageCategories />}
      </div>
      <div role="radiogroup" aria-label="Categoria do compromisso" className="flex flex-wrap gap-1.5">
        {appointmentCategories.map((c) => (
          <CategoryChip key={c.id} category={c} active={c.id === value} onClick={() => onChange(c.id === value ? undefined : c.id)} />
        ))}
        <CreateCategory onCreated={(c) => onChange(c.id)} />
      </div>
    </div>
  )
}
