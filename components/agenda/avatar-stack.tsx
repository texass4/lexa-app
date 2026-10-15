import { cn } from "cn"
import { UserAvatar } from "@/components/ui/user-avatar"
import { getUser } from "@/lib/auth/account"

/**
 * Fotos das pessoas do compromisso, sobrepostas (as iniciais quando não há foto).
 * `max` mostra as primeiras e resume o resto em "+N".
 */
export function AvatarStack({
  ids,
  size = "xs",
  max = 3,
  className,
  ring = "ring-card",
}: {
  ids: string[]
  size?: "xs" | "sm" | "md"
  max?: number
  className?: string
  ring?: string
}) {
  if (!ids.length) return null
  const shown = ids.slice(0, max)
  const rest = ids.length - shown.length
  const names = ids.map((id) => getUser(id).name).join(", ")
  return (
    <span className={cn("inline-flex items-center", className)} role="img" aria-label={names} title={names}>
      {shown.map((id, i) => {
        const user = getUser(id)
        return <UserAvatar key={id} name={user.name} src={user.avatarUrl} size={size} className={cn("ring-2", ring, i > 0 && "-ml-1.5")} />
      })}
      {rest > 0 && (
        <span
          aria-hidden
          className={cn(
            "-ml-1.5 inline-flex items-center justify-center rounded-full bg-surface-muted font-semibold text-muted-foreground ring-2",
            ring,
            size === "xs" ? "size-5 text-[9px]" : size === "sm" ? "size-6 text-[10px]" : "size-8 text-[11px]",
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}
