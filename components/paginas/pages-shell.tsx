"use client"

import * as React from "react"
import { PanelLeft } from "lucide-react"
import { SideSheet } from "@/components/ui/side-sheet"
import { createLocalStore, useMediaQuery } from "@/lib/core/hooks"
import { hasUnsavedPages } from "@/lib/paginas/pages"
import { NewPageProvider } from "./new-page-dialog"
import { PagesNav } from "./pages-sidebar"

const navStore = createLocalStore("lexa:paginas:navegacao", "aberta")

interface ChromeValue {
  /** Abre/fecha a navegação (coluna nas telas largas, gaveta nas estreitas). */
  toggleNav: () => void
  navVisible: boolean
}

const ChromeContext = React.createContext<ChromeValue>({ toggleNav: () => {}, navVisible: true })

export function NavToggle() {
  const { toggleNav, navVisible } = React.useContext(ChromeContext)
  return (
    <button
      type="button"
      onClick={toggleNav}
      aria-label={navVisible ? "Ocultar a lista de páginas" : "Mostrar a lista de páginas"}
      title={navVisible ? "Ocultar a lista de páginas" : "Mostrar a lista de páginas"}
      className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <PanelLeft className="size-4" />
    </button>
  )
}

/**
 * Área de Páginas (dentro de Tarefas): navegação à esquerda, recolhível, e o conteúdo
 * ocupando o resto. Avisa antes de fechar a aba com conteúdo ainda não gravado.
 */
export function PagesShell({ children }: { children: React.ReactNode }) {
  const wide = useMediaQuery("(min-width: 1024px)")
  const stored = React.useSyncExternalStore(navStore.subscribe, navStore.get, navStore.getServer)
  const [drawer, setDrawer] = React.useState(false)
  const columnOpen = stored === "aberta"

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedPages()) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  const value = React.useMemo<ChromeValue>(
    () => ({
      toggleNav: () => (wide ? navStore.set(columnOpen ? "recolhida" : "aberta") : setDrawer((d) => !d)),
      navVisible: wide ? columnOpen : drawer,
    }),
    [wide, columnOpen, drawer],
  )

  return (
    <NewPageProvider>
      <ChromeContext.Provider value={value}>
        <div className="flex min-w-0 gap-6">
          {wide && columnOpen && (
            <aside className="sticky top-[96px] h-[calc(100dvh-120px)] w-[244px] shrink-0 self-start border-r border-border/70 pr-3">
              <PagesNav />
            </aside>
          )}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        {!wide && (
          <SideSheet
            open={drawer}
            onOpenChange={setDrawer}
            title="Páginas"
            className="sm:w-[340px]"
            header={<p className="px-5 pt-4 pb-3 text-[15px] font-semibold text-foreground">Páginas</p>}
          >
            <div className="h-full min-h-0 px-4 pb-4">
              <PagesNav onNavigate={() => setDrawer(false)} />
            </div>
          </SideSheet>
        )}
      </ChromeContext.Provider>
    </NewPageProvider>
  )
}
