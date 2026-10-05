"use client"

import { toast } from "sonner"
import { useOfficeActions, useOfficeData } from "@/lib/store/office-store"
import { linkedRecordsSummary, resolveClientStatus } from "@/lib/clientes/clients"
import { clientHub } from "@/lib/store/selectors"
import { downloadFile, fileSlug } from "@/lib/core/export"
import { getNow, toLocalISO } from "@/lib/core/dates"
import { getUser } from "@/lib/auth/account"
import { useSession } from "@/lib/auth/session"
import { withoutFinance } from "@/lib/financeiro/access"
import { clientScopes } from "@/lib/store/storage"
import type { Client, ClientStatus } from "@/types"

/** Ações de cliente usadas na lista e no perfil. */
export function useClientActions() {
  const data = useOfficeData()
  const { updateClient, ensureScopes, ensureFullProcesses, currentState } = useOfficeActions()
  const { can } = useSession()

  return {
    /** Desativa (ou reativa) sem apagar nada — com "Desfazer". */
    toggleActive(client: Client) {
      // Reativar um cadastro sem CPF/CNPJ o devolve a Contato.
      const next: ClientStatus = client.status === "inativo" ? resolveClientStatus("ativo", client.document) : "inativo"
      updateClient(client.id, { status: next })
      toast.success(next === "inativo" ? "Cliente desativado." : "Cliente reativado.", {
        description: client.name,
        action: { label: "Desfazer", onClick: () => updateClient(client.id, { status: client.status }) },
      })
    },

    /**
     * Baixa a ficha completa do cliente em JSON (portabilidade/LGPD): cadastro e tudo
     * o que está vinculado e que a pessoa logada pode ver. Arquivos não entram, só os dados deles.
     */
    async exportClient(client: Client) {
      // A abertura traz só resumos e janelas recentes: antes de exportar, busca tudo do
      // cliente (histórico de tarefas, documentos, lançamentos, atividades) e as
      // movimentações completas dos processos dele.
      const processIds = data.processes.filter((p) => p.clientId === client.id).map((p) => p.id)
      try {
        await Promise.all([ensureScopes(clientScopes(client.id, processIds, { withActivities: true })), ensureFullProcesses(processIds)])
      } catch (error) {
        console.error("[exportação] Não foi possível carregar os dados do cliente:", error)
        toast.error("Não foi possível exportar agora.", { description: "Verifique a conexão e tente de novo." })
        return
      }
      const current = withoutFinance(currentState(), can("finance.view"))
      const hub = clientHub(current, client.id)
      const payload = {
        exportedAt: toLocalISO(getNow()),
        client: { ...client, owner: getUser(client.ownerId).name },
        // `undefined` some do JSON: sai o objeto bruto da fonte e o caminho interno do arquivo.
        processes: hub.processes.map((p) => ({ ...p, movements: p.movements.map((m) => ({ ...m, raw: undefined })) })),
        tasks: hub.tasks,
        documents: hub.documents.map((d) => ({ ...d, storagePath: undefined })),
        appointments: hub.appointments,
        invoices: current.invoices.filter((i) => i.clientId === client.id),
        timeline: hub.activities,
      }
      downloadFile(`cliente-${fileSlug(client.name)}.json`, JSON.stringify(payload, null, 2), "application/json")
      toast.success("Dados do cliente exportados.", { description: client.name })
    },

    /** Texto da confirmação de exclusão, com o que fica sem cliente. */
    deleteDescription(client: Client) {
      const linked = linkedRecordsSummary(data, client.id)
      return `Esta ação não pode ser desfeita. ${
        linked ? `Continuam salvos, sem o nome do cliente: ${linked.charAt(0).toLowerCase()}${linked.slice(1)}.` : "Não há registros vinculados."
      } Se o relacionamento apenas terminou, prefira desativar o cliente.`
    },
  }
}
