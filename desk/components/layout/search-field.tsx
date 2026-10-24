"use client"

import { Search } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { cn } from "@/lib/cn"

/** Campo de busca que atualiza o parâmetro `q` da URL (com uma pequena espera). */
export function SearchField({ placeholder, initial, className }: { placeholder: string; initial: string; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(initial)
  const [pending, start] = useTransition()
  useEffect(() => {
    if (value === (params.get("q") ?? "")) return
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (value.trim()) next.set("q", value.trim())
      else next.delete("q")
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }))
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className={cn("relative", className)}>
      <Search className={cn("pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-4", pending && "animate-pulse")} />
      <input type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="field h-8 w-64 max-w-full py-0 pl-8 text-xs" />
    </div>
  )
}
