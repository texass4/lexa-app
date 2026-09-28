"use client"

import * as React from "react"
import { toast } from "sonner"
import { adminFetch } from "@/lib/admin/client"
import { ORG_STATUS, type OrgStatus } from "@/lib/admin/catalog"
import type { ConfirmRequest } from "../ui/confirm-action"
import { useAdminShell } from "../shell/admin-context"

type OrgRef = { id: string; name: string; status: OrgStatus; plan: string }

/**
 * Ações de escritório compartilhadas pela lista e pela página de detalhe: alterar
 * (PATCH) com toast, e pedidos de confirmação para mudanças de status críticas.
 */
export function useOrgActions(onChanged: () => void) {
  const { refresh } = useAdminShell()
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null)

  const patch = React.useCallback(
    async (org: OrgRef, body: Record<string, unknown>, message: string) => {
      try {
        await adminFetch(`/api/admin/organizations/${org.id}`, "PATCH", body)
        toast.success(message, { description: org.name })
        onChanged()
        refresh()
      } catch (err) {
        toast.error((err as Error).message)
        throw err
      }
    },
    [onChanged, refresh],
  )

  /** Muda o status; suspender e desativar pedem confirmação (e motivo). */
  const setStatus = React.useCallback(
    (org: OrgRef, status: OrgStatus) => {
      if (status === "active") {
        const message = org.status === "pending" ? "Escritório aprovado." : "Escritório reativado."
        void patch(org, { status }, message).catch(() => undefined)
        return
      }
      if (status === "suspended") {
        setConfirm({
          title: `Suspender ${org.name}?`,
          description: "Todos os usuários perdem o acesso na hora. Os dados ficam guardados e você pode reativar quando quiser (ex.: após regularizar o pagamento).",
          confirmLabel: "Suspender",
          askReason: "required",
          reasonLabel: "Motivo da suspensão",
          onConfirm: (reason) => patch(org, { status, statusReason: reason }, "Escritório suspenso."),
        })
        return
      }
      if (status === "inactive") {
        const refusing = org.status === "pending"
        setConfirm({
          title: refusing ? `Recusar o cadastro de ${org.name}?` : `Desativar ${org.name}?`,
          description: refusing
            ? "O cadastro fica inativo e a pessoa que se cadastrou não consegue entrar."
            : "Todos os usuários perdem o acesso na hora e a assinatura é cancelada. Os dados ficam guardados e o escritório pode ser reativado depois.",
          confirmLabel: refusing ? "Recusar cadastro" : "Desativar",
          askReason: true,
          requireText: refusing ? undefined : org.name,
          onConfirm: (reason) => patch(org, { status, statusReason: reason || null }, refusing ? "Cadastro recusado." : "Escritório desativado."),
        })
        return
      }
      void patch(org, { status }, `Status alterado para ${ORG_STATUS[status].label}.`).catch(() => undefined)
    },
    [patch],
  )

  const setPlan = React.useCallback(
    (org: OrgRef, plan: string) => {
      if (plan === org.plan) return
      setConfirm({
        title: `Mudar ${org.name} para o plano ${plan}?`,
        description: "Os limites do novo plano valem na hora. A mudança fica registrada (upgrade/downgrade) no Financeiro e na auditoria. Nenhuma cobrança é feita automaticamente.",
        confirmLabel: "Alterar plano",
        tone: "default",
        onConfirm: () => patch(org, { plan }, `Plano alterado para ${plan}.`),
      })
    },
    [patch],
  )

  return { patch, setStatus, setPlan, confirm, closeConfirm: () => setConfirm(null) }
}
