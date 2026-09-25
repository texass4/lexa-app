import { Suspense } from "react"
import type { Metadata } from "next"
import { ClientProfile } from "@/components/clientes/profile/client-profile"

// Os clientes ficam salvos no navegador — o servidor não os conhece.
export const metadata: Metadata = { title: "Cliente" }

export default async function ClientePage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params
  return (
    <Suspense>
      <ClientProfile id={id} />
    </Suspense>
  )
}
