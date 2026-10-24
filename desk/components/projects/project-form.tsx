"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { createProjectAction } from "@/app/actions/projects"
import { useShell } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { PROJECT_STATUS_OPTIONS } from "./status"

export function NewProjectDialog({ open, onOpenChange, defaultAreaId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultAreaId?: string }) {
  const { areas } = useShell()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const submit = (form: FormData) => {
    const title = String(form.get("title") ?? "").trim()
    if (!title) return setError("Dê um nome ao projeto.")
    start(async () => {
      const result = await createProjectAction({
        title,
        description: String(form.get("description") ?? ""),
        status: (form.get("status") as "active") || "active",
        areaId: (form.get("areaId") as string) || null,
        startDate: (form.get("startDate") as string) || null,
        targetDate: (form.get("targetDate") as string) || null,
      })
      if (!result.ok) return setError(result.error)
      onOpenChange(false)
      toast.success("Projeto criado.")
      router.push(`/projects/${result.data.id}`)
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Novo projeto" description="Um resultado com começo e fim. Para dimensões permanentes da vida, use Áreas.">
      <form action={submit} className="flex flex-col gap-4">
        <input name="title" autoFocus placeholder="Nome do projeto" className="field h-11 text-base" aria-label="Nome" maxLength={200} aria-invalid={error ? true : undefined} />
        <textarea name="description" rows={2} placeholder="Descrição (opcional)" className="field resize-none" aria-label="Descrição" />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Status</span>
            <select name="status" defaultValue="active" className="field">
              {PROJECT_STATUS_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Área</span>
            <select name="areaId" defaultValue={defaultAreaId ?? ""} className="field">
              <option value="">Nenhuma</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Início</span>
            <input type="date" name="startDate" className="field" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Meta</span>
            <input type="date" name="targetDate" className="field" />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-clay">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Criando…" : "Criar projeto"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function NewProjectButton({ autoOpen, defaultAreaId, variant = "primary", label = "Novo projeto" }: { autoOpen?: boolean; defaultAreaId?: string; variant?: "primary" | "ghost" | "secondary"; label?: string }) {
  const [open, setOpen] = useState(!!autoOpen)
  const router = useRouter()
  return (
    <>
      <Button variant={variant} size={variant === "ghost" ? "sm" : "md"} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <NewProjectDialog
        open={open}
        defaultAreaId={defaultAreaId}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o && autoOpen) router.replace("/projects")
        }}
      />
    </>
  )
}
