"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateSettingsAction } from "@/app/actions/settings"
import { deleteTagAction, renameTagAction } from "@/app/actions/tasks"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm"

const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]

export function PreferencesForm({ initial, browserTimezone }: { initial: { ownerName: string; timezone: string | null; weekStartsOn: number }; browserTimezone: string }) {
  const [pending, start] = useTransition()
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [browserTimezone]
  const submit = (form: FormData) =>
    start(async () => {
      const r = await updateSettingsAction({
        ownerName: String(form.get("ownerName") ?? ""),
        timezone: (form.get("timezone") as string) || null,
        weekStartsOn: Number(form.get("weekStartsOn") ?? 1),
      })
      if (!r.ok) return void toast.error(r.error)
      toast.success("Preferências salvas.")
    })
  return (
    <form action={submit} className="grid gap-5 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Como chamar você</span>
        <input name="ownerName" defaultValue={initial.ownerName} placeholder="Seu nome (aparece na saudação)" className="field" maxLength={80} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">A semana começa em</span>
        <select name="weekStartsOn" defaultValue={String(initial.weekStartsOn)} className="field">
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="eyebrow">Fuso horário</span>
        <select name="timezone" defaultValue={initial.timezone ?? ""} className="field">
          <option value="">Automático — o do navegador ({browserTimezone})</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-4">Define o que é “hoje” e quando uma tarefa fica atrasada. Prazos são datas locais e nunca mudam de dia com o fuso.</span>
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar preferências"}
        </Button>
      </div>
    </form>
  )
}

export function TagManager({ tags }: { tags: { id: string; name: string; count: number }[] }) {
  const confirm = useConfirm()
  const [, start] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  if (tags.length === 0) return <p className="text-sm text-ink-4">Nenhuma tag ainda. Elas são criadas ao marcar uma tarefa.</p>
  return (
    <ul className="divide-y divide-line-soft border-y border-line-soft">
      {tags.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2">
          {editing === t.id ? (
            <form
              className="flex-1"
              onSubmit={(e) => {
                e.preventDefault()
                const name = String(new FormData(e.currentTarget).get("name") ?? "").trim()
                setEditing(null)
                if (name && name !== t.name)
                  start(async () => {
                    const r = await renameTagAction(t.id, name)
                    if (!r.ok) toast.error(r.error)
                  })
              }}
            >
              <input name="name" defaultValue={t.name} autoFocus onBlur={(e) => e.currentTarget.form?.requestSubmit()} className="field h-8 max-w-xs" aria-label="Novo nome da tag" maxLength={40} />
            </form>
          ) : (
            <button onClick={() => setEditing(t.id)} className="flex-1 text-left text-sm text-sage-ink hover:underline" title="Renomear">
              #{t.name}
            </button>
          )}
          <span className="meta">{t.count} tarefas</span>
          <button
            onClick={async () => {
              if (await confirm({ title: `Remover a tag #${t.name}?`, description: "As tarefas continuam existindo; só perdem esta tag.", confirmLabel: "Remover", danger: true }))
                start(async () => {
                  const r = await deleteTagAction(t.id)
                  if (!r.ok) toast.error(r.error)
                })
            }}
            className="text-xs text-ink-4 hover:text-clay"
          >
            Remover
          </button>
        </li>
      ))}
    </ul>
  )
}
