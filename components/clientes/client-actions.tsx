"use client"

import { toast } from "sonner"
import { useDemoActions, useDemoData } from "@/lib/store/demo-store"
import { linkedRecordsSummary } from "@/lib/clients"
import { clientHub } from "@/lib/selectors"
import { downloadFile, fileSlug } from "@/lib/export"
import { getNow, toLocalISO } from "@/lib/dates"
import { getUser } from "@/lib/account"
import type { Client, ClientStatus } from "@/types"

/** Ações de cliente usadas na lista e no perfil. */
export function useClientActions() {
  const data = useDemoData()
  const { updateClient } = useDemoActions()

  return {
    /** Desativa (ou reativa) sem apagar nada — com "Desfazer". */
    toggleActive(client: Client) {
      const next: ClientStatus = client.status === "inativo" ? "ativo" : "inativo"
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
    exportClient(client: Client) {
      const hub = clientHub(data, client.id)
      const payload = {
        exportedAt: toLocalISO(getNow()),
        client: { ...client, owner: getUser(client.ownerId).name },
        // `undefined` some do JSON: sai o objeto bruto da fonte e o caminho interno do arquivo.
        processes: hub.processes.map((p) => ({ ...p, movements: p.movements.map((m) => ({ ...m, raw: undefined })) })),
        tasks: hub.tasks,
        documents: hub.documents.map((d) => ({ ...d, storagePath: undefined })),
        appointments: hub.appointments,
        invoices: data.invoices.filter((i) => i.clientId === client.id),
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
