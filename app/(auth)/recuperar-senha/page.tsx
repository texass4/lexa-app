import type { Metadata } from "next"
import { RecoverForm } from "@/components/auth/recover-form"

export const metadata: Metadata = { title: "Recuperar senha" }

export default function RecuperarSenhaPage() {
  return <RecoverForm />
}
