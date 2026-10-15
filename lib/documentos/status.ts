import type { DocumentStatus } from "@/types"

/** Nome de cada situação do documento (o mesmo na lista, no painel e na atividade). */
export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  ok: "OK",
  revisao: "Em revisão",
  assinado: "Assinado",
}
