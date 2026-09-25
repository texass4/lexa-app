import { Suspense } from "react"
import type { Metadata } from "next"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata: Metadata = { title: "Nova senha" }

export default function RedefinirSenhaPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
