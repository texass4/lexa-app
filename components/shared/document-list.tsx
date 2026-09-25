"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Download, Ellipsis, Eye, Link2 } from "lucide-react"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FileIcon } from "./file-icon"
import { useDemoData } from "@/lib/store/demo-store"
import { fmtNumericDate } from "@/lib/dates"
import { formatFileSize } from "@/lib/format"
import { getUser } from "@/lib/account"
import type { LegalDocument } from "@/types"

export function DocumentActions({ doc }: { doc: LegalDocument }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Ações para ${doc.name}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/40 aria-expanded:bg-accent"
      >
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-[10px] p-1">
        <DropdownMenuGroup>
          <DropdownMenuItem className="h-8 px-2" onClick={() => toast("Pré-visualização aberta.", { description: doc.name })}>
            <Eye /> Visualizar
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => toast.success("Download iniciado.", { description: doc.name })}>
            <Download /> Baixar
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 px-2" onClick={() => toast.success("Link copiado.", { description: "Válido por 7 dias para o cliente." })}>
            <Link2 /> Copiar link seguro
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Lista compacta de documentos (perfil do cliente e do processo). */
export function DocumentList({ documents, showClient = false }: { documents: LegalDocument[]; showClient?: boolean }) {
  const data = useDemoData()
  return (
    <ul className="divide-y divide-border">
      <AnimatePresence initial={false}>
        {documents.map((d) => {
          const client = data.clients.find((c) => c.id === d.clientId)
          const process = data.processes.find((p) => p.id === d.processId)
          return (
            <motion.li
              key={d.id}
              layout
              initial={{ opacity: 0, backgroundColor: "rgba(168,134,85,0.12)" }}
              animate={{ opacity: 1, backgroundColor: "rgba(168,134,85,0)" }}
              transition={{ duration: 0.3, backgroundColor: { duration: 1.6 } }}
              className="flex items-center gap-3.5 px-4 py-3 sm:px-5"
            >
              <FileIcon extension={d.extension} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-foreground">{d.name}</p>
                <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-muted-foreground">
                  <span>{d.kind}</span>
                  {showClient && client && (
                    <>
                      <span className="text-subtle">·</span>
                      <Link href={`/clientes/${client.id}`} className="hover:text-foreground hover:underline">
                        {client.name}
                      </Link>
                    </>
                  )}
                  {process && (
                    <>
                      <span className="text-subtle">·</span>
                      <Link href={`/processos/${process.id}`} className="hover:text-foreground hover:underline">
                        {process.code}
                      </Link>
                    </>
                  )}
                  <span className="text-subtle sm:hidden">·</span>
                  <span className="tabular sm:hidden">{fmtNumericDate(d.uploadedAt)}</span>
                </p>
              </div>
              <div className="hidden w-28 shrink-0 text-right sm:block">
                <p className="tabular text-[12.5px] text-foreground">{fmtNumericDate(d.uploadedAt)}</p>
                <p className="text-[11.5px] text-subtle">por {getUser(d.uploadedById).firstName}</p>
              </div>
              <span className="tabular hidden w-16 shrink-0 text-right text-[12px] text-muted-foreground md:block">
                {formatFileSize(d.sizeBytes)}
              </span>
              <DocumentActions doc={d} />
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
