import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { AuthCard } from "@/components/auth/auth-card"

/** 404 fora do app (pode ser vista sem login, então não usa o AppShell). */
export default function NotFound() {
  return (
    <AuthCard title="Página não encontrada" description="O endereço acessado não existe ou foi movido.">
      <Link href="/" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
        Voltar ao início
      </Link>
    </AuthCard>
  )
}
