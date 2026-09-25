import { cn } from "cn"
import { initials } from "@/lib/format"

const PALETTE = [
  "bg-[#EFE9DF] text-[#6F5733] dark:bg-[#2A241B] dark:text-[#D8BB90]",
  "bg-[#E8ECEF] text-[#3F4E5C] dark:bg-[#1C232A] dark:text-[#A9B8C7]",
  "bg-[#ECEAE6] text-[#4A4744] dark:bg-[#23221F] dark:text-[#BDB9B2]",
  "bg-[#E6EDE8] text-[#3B5946] dark:bg-[#18241C] dark:text-[#9CC4A9]",
  "bg-[#EEE8EC] text-[#5B4453] dark:bg-[#271E24] dark:text-[#C9AEBF]",
]

function hash(text: string) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-[11px]",
  lg: "size-10 text-[13px]",
  xl: "size-16 text-lg",
}

export function UserAvatar({
  name,
  src,
  size = "md",
  className,
  tone,
}: {
  name: string
  /** Foto de perfil; sem ela, as iniciais. */
  src?: string
  size?: keyof typeof SIZES
  className?: string
  tone?: "dark"
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold tracking-wide",
        SIZES[size],
        tone === "dark" ? "bg-primary text-primary-foreground" : PALETTE[hash(name) % PALETTE.length],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  )
}
