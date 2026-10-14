import { cn } from "cn"
import { initials } from "@/lib/core/format"

// Iniciais em tons discretos da paleta (azul, petróleo, ardósia, âmbar, violeta) — sempre com o nome por perto.
const PALETTE = [
  "bg-[#E6EEFE] text-[#1D4ED8] dark:bg-[#14243F] dark:text-[#9DBCFB]",
  "bg-[#E2F2EF] text-[#0F766E] dark:bg-[#0F2623] dark:text-[#5FC2B4]",
  "bg-[#E9EEF4] text-[#334A63] dark:bg-[#1B2B3F] dark:text-[#A9B9CC]",
  "bg-[#FBF0E1] text-[#9A4A0A] dark:bg-[#2B2012] dark:text-[#E3A560]",
  "bg-[#EFEBFB] text-[#5B3FB0] dark:bg-[#1E1A33] dark:text-[#AC9AE6]",
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
  /** dark: azul profundo (a pessoa logada, no topo); gold: mantido por compatibilidade — mesmo visual do azul de ação. */
  tone?: "dark" | "gold"
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold tracking-wide",
        SIZES[size],
        tone === "dark"
          ? "bg-navy text-white dark:bg-brand-soft dark:text-brand-strong"
          : tone === "gold"
            ? "bg-brand-soft text-brand-strong"
            : PALETTE[hash(name) % PALETTE.length],
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
