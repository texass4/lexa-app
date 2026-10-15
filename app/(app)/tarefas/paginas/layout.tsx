import { Suspense } from "react"
import { PagesShell } from "@/components/paginas/pages-shell"

export default function PaginasLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <PagesShell>{children}</PagesShell>
    </Suspense>
  )
}
