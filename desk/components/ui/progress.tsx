import type { Progress } from "@/lib/domain/tasks"
import { cn } from "@/lib/cn"

/** Progresso calculado das tarefas; sem tarefas elegíveis mostra "Sem tarefas", nunca 0% inventado. */
export function ProgressBar({ progress, className, showLabel = true }: { progress: Progress; className?: string; showLabel?: boolean }) {
  if (!progress) return <span className={cn("meta", className)}>Sem tarefas</span>
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="h-1 flex-1 overflow-hidden rounded-full bg-paper-3"
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progress.done} de ${progress.total} tarefas concluídas`}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-300", progress.percent === 100 ? "bg-sage-ink" : "bg-cobalt")} style={{ width: `${progress.percent}%` }} />
      </div>
      {showLabel ? (
        <span className="meta shrink-0">
          {progress.done}/{progress.total} · {progress.percent}%
        </span>
      ) : null}
    </div>
  )
}
