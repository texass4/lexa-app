import { BookOpen, Compass, FileText, FolderKanban, ListChecks, Waypoints, type LucideIcon } from "lucide-react"
import type { RefType } from "@/lib/domain/refs"

/** Ícone de cada tipo de registro, igual em toda a aplicação. */
export const REF_ICON: Record<RefType, LucideIcon> = {
  task: ListChecks,
  project: FolderKanban,
  area: Compass,
  page: FileText,
  journal: BookOpen,
  board: Waypoints,
}
