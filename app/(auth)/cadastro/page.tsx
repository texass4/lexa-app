import type { Metadata } from "next"
import { SignupForm } from "@/components/auth/signup-form"

export const metadata: Metadata = { title: "Cadastro" }

export default function CadastroPage() {
  return <SignupForm />
}
