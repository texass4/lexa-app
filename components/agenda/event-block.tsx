import { Check, Flag, Repeat, Video } from "lucide-react"
import { cn } from "cn"
import { AvatarStack } from "./avatar-stack"
import { appointmentStatus, participantsOf } from "@/lib/agenda/agenda"
import { fmtTime } from "@/lib/core/dates"
import type { Appointment } from "@/types"

/** Sinais pequenos do compromisso: prioridade alta, videochamada, série e realizado. */
export function EventMarks({ a, className }: { a: Appointment; className?: string }) {
  const status = appointmentStatus(a)
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {status === "realizado" && <Check className="size-3 text-success" aria-label="Realizado" />}
      {a.priority === "alta" && <Flag className="size-3 fill-danger text-danger" aria-label="Prioridade alta" />}
      {a.seriesId && <Repeat className="size-3 opacity-70" aria-label="Faz parte de uma série" />}
      {a.videoUrl && <Video className="size-3 opacity-70" aria-label="Tem videochamada" />}
    </span>
  )
}

/**
 * Conteúdo do cartão na grade. Depende da altura: bem baixo, uma linha; médio, título,
 * pessoa e horário; alto, com as fotos de quem participa no rodapé.
 */
export function EventBlock({ a, height, label, textStyle }: { a: Appointment; height: number; label: string; textStyle: React.CSSProperties }) {
  const cancelled = appointmentStatus(a) === "cancelado"
  const people = participantsOf(a)
  const compact = height < 40
  const withPeople = height >= 56
  return (
    <>
      <div className="flex items-start gap-1">
        <p className={cn("min-w-0 flex-1 truncate text-[12px] leading-tight font-semibold", cancelled && "line-through")} style={textStyle}>
          {compact ? `${fmtTime(a.start)} ${a.title}` : label}
        </p>
        <EventMarks a={a} className="mt-px" />
      </div>
      {!compact && (
        <>
          {a.personName && (
            <p className={cn("truncate text-[11.5px] leading-tight text-foreground/80", cancelled && "line-through")}>{a.personName}</p>
          )}
          {height > 58 && (
            <p className="tabular mt-0.5 truncate text-[11px] text-muted-foreground">
              {fmtTime(a.start)} – {fmtTime(a.end)}
            </p>
          )}
        </>
      )}
      {withPeople && people.length > 0 && <AvatarStack ids={people} size="xs" max={3} className="absolute right-2 bottom-1.5" />}
    </>
  )
}
