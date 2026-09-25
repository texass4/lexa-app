import Link from "next/link"
import { Compass } from "lucide-react"
import { Panel } from "@/components/ui/panel"
import { EmptyState } from "@/components/ui/empty-state"
import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <Panel className="mt-4">
      <EmptyState
        icon={<Compass />}
        title="Página não encontrada."
        description="O endereço acessado não existe ou foi movido. Volte ao painel para continuar."
        action={
          <Link href="/dashboard" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Voltar ao painel
          </Link>
        }
      />
    </Panel>
  )
}
