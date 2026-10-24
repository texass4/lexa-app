"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { createBoardAction } from "@/app/actions/boards"
import { createPageAction } from "@/app/actions/pages"
import { Button } from "@/components/ui/button"

/** Cria uma página ou um quadro já associado (projeto/área) e abre em seguida. */
export function CreateAndOpenButton({ kind, projectId, areaId, label, variant = "ghost" }: { kind: "page" | "board"; projectId?: string; areaId?: string; label: string; variant?: "ghost" | "secondary" | "primary" }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const create = () =>
    start(async () => {
      const result = kind === "page" ? await createPageAction({ projectId: projectId ?? null, areaId: areaId ?? null }) : await createBoardAction({ projectId: projectId ?? null, areaId: areaId ?? null })
      if (!result.ok) return void toast.error(result.error)
      router.push(kind === "page" ? `/pages/${result.data.id}` : `/canvas/${result.data.id}`)
    })
  return (
    <Button size={variant === "ghost" ? "sm" : "md"} variant={variant} onClick={create} disabled={pending}>
      <Plus />
      {pending ? "Criando…" : label}
    </Button>
  )
}
