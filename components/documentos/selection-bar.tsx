"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Download, FolderInput, Link2, Star, StarOff, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LegalDocument } from "@/types"
import { useDocumentsActions } from "./document-actions"

/**
 * Barra de ações da seleção (flutuante, no rodapé da área de arquivos). Só operações
 * válidas para todos os selecionados e permitidas a quem está usando.
 */
export function SelectionBar({ docs, onClear }: { docs: LegalDocument[]; onClear: () => void }) {
  const a = useDocumentsActions()
  const reduce = useReducedMotion()
  const allFavorite = docs.length > 0 && docs.every((d) => a.isFavorite(d.id))
  const withFile = docs.filter((d) => d.storagePath).length

  return (
    <AnimatePresence>
      {docs.length > 0 && (
        <motion.div
          role="region"
          aria-label="Ações para os documentos selecionados"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="sticky bottom-[calc(env(safe-area-inset-bottom)+84px)] z-30 mx-auto mt-3 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-[14px] border border-border bg-popover p-1.5 shadow-float no-scrollbar md:bottom-5"
        >
          <span className="px-2.5 text-[13px] font-semibold whitespace-nowrap text-foreground" aria-live="polite">
            {docs.length} selecionado{docs.length === 1 ? "" : "s"}
          </span>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
          {withFile > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => a.download(docs)}
              title={withFile < docs.length ? `${docs.length - withFile} sem arquivo salvo` : undefined}
            >
              <Download /> <span className="max-sm:sr-only">Baixar</span>
            </Button>
          )}
          {a.favoritesReady && (
            <Button variant="ghost" size="sm" onClick={() => a.favorite(docs, !allFavorite)}>
              {allFavorite ? <StarOff /> : <Star />} <span className="max-sm:sr-only">{allFavorite ? "Desfavoritar" : "Favoritar"}</span>
            </Button>
          )}
          {withFile > 0 && (
            <Button variant="ghost" size="sm" onClick={() => a.copyLinks(docs)}>
              <Link2 /> <span className="max-sm:sr-only">Copiar links</span>
            </Button>
          )}
          {a.canEdit && (
            <>
              <Button variant="ghost" size="sm" onClick={() => a.move(docs)}>
                <FolderInput /> <span className="max-sm:sr-only">Mover</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => a.remove(docs, onClear)}
              >
                <Trash2 /> <span className="max-sm:sr-only">Excluir</span>
              </Button>
            </>
          )}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
          <Button variant="ghost" size="icon-sm" aria-label="Limpar seleção" title="Limpar seleção (Esc)" onClick={onClear}>
            <X />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
