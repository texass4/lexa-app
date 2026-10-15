"use client"

import * as React from "react"
import { ContextMenu } from "@base-ui/react/context-menu"
import { Download, Ellipsis, Eye, FolderInput, Info, Link2, Pencil, Star, StarOff, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useOfficeActions } from "@/lib/store/office-store"
import { useSession } from "@/lib/auth/session"
import { copyDocumentLink, documentUrl, downloadDocument, downloadDocuments } from "@/lib/documentos/documents"
import { forgetFavorites, setFavorites, useDocumentFavorites } from "@/lib/documentos/favorites"
import type { LegalDocument } from "@/types"
import { MoveDocumentsDialog, RenameDocumentDialog } from "./document-dialogs"

/**
 * Ações da Central de Documentos, as mesmas em todo lugar (linha, grade, painel de
 * detalhes, visualizador, seleção e clique direito). Cada uma respeita a permissão:
 * quem só vê documentos não vê renomear, mover nem excluir — e o banco recusaria.
 */
interface DocumentsActions {
  canEdit: boolean
  favoritesReady: boolean
  isFavorite(id: string): boolean
  open(doc: LegalDocument): void
  details(doc: LegalDocument): void
  rename(doc: LegalDocument): void
  move(docs: LegalDocument[]): void
  remove(docs: LegalDocument[], after?: () => void): void
  favorite(docs: LegalDocument[], on: boolean): Promise<boolean>
  download(docs: LegalDocument[]): void
  copyLinks(docs: LegalDocument[]): void
}

const Ctx = React.createContext<DocumentsActions | null>(null)

export function useDocumentsActions() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("useDocumentsActions fora de DocumentsActionsProvider")
  return ctx
}

const SHARE_SECONDS = 7 * 24 * 60 * 60

export function DocumentsActionsProvider({
  onOpen,
  onDetails,
  children,
}: {
  onOpen: (doc: LegalDocument) => void
  onDetails: (doc: LegalDocument) => void
  children: React.ReactNode
}) {
  const { can } = useSession()
  const { deleteDocument } = useOfficeActions()
  const favorites = useDocumentFavorites()
  const [renaming, setRenaming] = React.useState<LegalDocument>()
  const [moving, setMoving] = React.useState<LegalDocument[]>()
  const [deleting, setDeleting] = React.useState<{ docs: LegalDocument[]; after?: () => void }>()
  const canEdit = can("documents.edit")

  const value: DocumentsActions = {
    canEdit,
    favoritesReady: favorites.status === "ready",
    isFavorite: favorites.isFavorite,
    open: onOpen,
    details: onDetails,
    rename: (doc) => canEdit && setRenaming(doc),
    move: (docs) => canEdit && docs.length > 0 && setMoving(docs),
    remove: (docs, after) => canEdit && docs.length > 0 && setDeleting({ docs, after }),
    async favorite(docs, on) {
      const ok = await setFavorites(
        docs.map((d) => d.id),
        on,
      )
      if (ok)
        toast.success(
          on
            ? docs.length === 1
              ? "Adicionado aos favoritos."
              : `${docs.length} adicionados aos favoritos.`
            : docs.length === 1
              ? "Removido dos favoritos."
              : `${docs.length} removidos dos favoritos.`,
        )
      return ok
    },
    async download(docs) {
      if (docs.length === 1) return downloadDocument(docs[0])
      const { started, missing } = await downloadDocuments(docs)
      if (!started) toast("Nenhum dos selecionados tem arquivo salvo.")
      else
        toast.success(`${started} download${started === 1 ? "" : "s"} iniciado${started === 1 ? "" : "s"}.`, {
          description: missing ? `${missing} sem arquivo salvo (só o registro).` : undefined,
        })
    },
    async copyLinks(docs) {
      if (docs.length === 1) return copyDocumentLink(docs[0])
      const withFile = docs.filter((d) => d.storagePath)
      if (!withFile.length) return void toast("Nenhum dos selecionados tem arquivo salvo.")
      const urls = await Promise.all(withFile.map((d) => documentUrl(d, { download: true, expiresIn: SHARE_SECONDS })))
      const lines = withFile.flatMap((d, i) => (urls[i] ? [`${d.name}: ${urls[i]}`] : []))
      try {
        await navigator.clipboard.writeText(lines.join("\n"))
        toast.success(`${lines.length} link${lines.length === 1 ? "" : "s"} copiado${lines.length === 1 ? "" : "s"}.`, {
          description: "Qualquer pessoa com o link baixa o arquivo por 7 dias.",
        })
      } catch {
        toast.error("Não foi possível copiar os links.", { description: "Permita o acesso à área de transferência e tente de novo." })
      }
    },
  }

  const count = deleting?.docs.length ?? 0
  return (
    <Ctx.Provider value={value}>
      {children}
      <RenameDocumentDialog doc={renaming} onOpenChange={(o) => !o && setRenaming(undefined)} />
      <MoveDocumentsDialog docs={moving} onOpenChange={(o) => !o && setMoving(undefined)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={count === 1 ? `Excluir "${deleting?.docs[0].name}"?` : `Excluir ${count} documentos?`}
        description={
          <>
            {count === 1 ? "O registro e o arquivo são apagados" : "Os registros e os arquivos são apagados"} do armazenamento do escritório, e
            {count === 1 ? " o documento sai" : " os documentos saem"} do cliente e do processo. Não há lixeira: não dá para desfazer.
          </>
        }
        confirmLabel={count === 1 ? "Excluir documento" : `Excluir ${count}`}
        onConfirm={() => {
          if (!deleting) return
          for (const d of deleting.docs) deleteDocument(d.id)
          forgetFavorites(deleting.docs.map((d) => d.id))
          deleting.after?.()
          toast.success(count === 1 ? "Documento excluído." : `${count} documentos excluídos.`, {
            description: count === 1 ? deleting.docs[0].name : undefined,
          })
        }}
      />
    </Ctx.Provider>
  )
}

/** Os itens do menu de um documento (no "…" e no clique direito). */
function DocumentMenuItems({ doc }: { doc: LegalDocument }) {
  const a = useDocumentsActions()
  const favorite = a.isFavorite(doc.id)
  const item = "h-8 gap-2.5 px-2 text-[13px]"
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem className={item} onClick={() => a.open(doc)}>
          <Eye /> Abrir
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onClick={() => a.details(doc)}>
          <Info /> Ver detalhes
        </DropdownMenuItem>
        {doc.storagePath && (
          <>
            <DropdownMenuItem className={item} onClick={() => a.download([doc])}>
              <Download /> Baixar
            </DropdownMenuItem>
            <DropdownMenuItem className={item} onClick={() => a.copyLinks([doc])}>
              <Link2 /> Copiar link (7 dias)
            </DropdownMenuItem>
          </>
        )}
        {a.favoritesReady && (
          <DropdownMenuItem className={item} onClick={() => a.favorite([doc], !favorite)}>
            {favorite ? <StarOff /> : <Star />} {favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      {a.canEdit && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem className={item} onClick={() => a.rename(doc)}>
              <Pencil /> Renomear
            </DropdownMenuItem>
            <DropdownMenuItem className={item} onClick={() => a.move([doc])}>
              <FolderInput /> Mover…
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={item} variant="destructive" onClick={() => a.remove([doc])}>
            <Trash2 /> Excluir
          </DropdownMenuItem>
        </>
      )}
    </>
  )
}

/** Botão "…" com as ações do documento. */
export function DocumentMenuButton({ doc, className }: { doc: LegalDocument; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Ações para ${doc.name}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[8px] text-subtle outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 aria-expanded:bg-accent aria-expanded:text-foreground",
          className,
        )}
      >
        <Ellipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DocumentMenuItems doc={doc} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Clique direito (ou toque longo) sobre o item abre o mesmo menu. */
export function DocumentContextMenu({ doc, render }: { doc: LegalDocument; render: React.ReactElement<Record<string, unknown>> }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={render} />
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="isolate z-50 outline-none">
          <ContextMenu.Popup className="z-50 w-56 origin-(--transform-origin) rounded-[12px] bg-popover p-1.5 text-popover-foreground shadow-float ring-1 ring-border outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
            <DocumentMenuItems doc={doc} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
