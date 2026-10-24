"use client"

import { Dialog } from "@base-ui/react/dialog"
import { Menu as MenuIcon, Plus, Search, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Toaster } from "sonner"
import { reportTimezoneAction } from "@/app/actions/settings"
import { ConfirmProvider } from "@/components/ui/confirm"
import { DropdownMenu } from "@/components/ui/menu"
import { CommandPalette } from "./command-palette"
import { CaptureDialog, QuickTaskDialog } from "./quick-create"
import { ShellContext, useShell, type QuickTaskDefaults, type ShellData } from "./shell-context"
import { Brand, NavList, Sidebar, useCreateMenu } from "./sidebar"

const NAV_COOKIE = "mesa_nav"

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest("[contenteditable=true], .react-flow")
}

export function AppShell({ data, initialCollapsed, children }: { data: ShellData; initialCollapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [taskDefaults, setTaskDefaults] = useState<QuickTaskDefaults | null>(null)
  const [captureOpen, setCaptureOpen] = useState(false)

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const openQuickTask = useCallback((defaults: QuickTaskDefaults = {}) => setTaskDefaults(defaults), [])
  const openCapture = useCallback(() => setCaptureOpen(true), [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`
  }

  // Atalhos globais: Ctrl/⌘ K busca; N nova tarefa; C captura (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog]")) return
      if (e.key === "n" || e.key === "N") {
        e.preventDefault()
        openQuickTask()
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault()
        openCapture()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openCapture, openQuickTask])

  // Informa o fuso do navegador uma vez (o "hoje" é calculado no servidor com ele).
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && tz !== data.timezone && !document.cookie.includes(`mesa_tz=${encodeURIComponent(tz)}`)) void reportTimezoneAction(tz)
  }, [data.timezone])

  const api = useMemo(() => ({ ...data, openPalette, openQuickTask, openCapture }), [data, openPalette, openQuickTask, openCapture])

  return (
    <ShellContext.Provider value={api}>
      <ConfirmProvider>
        <a href="#conteudo" className="sr-only z-50 rounded-sm bg-cobalt px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Ir para o conteúdo
        </a>
        <div className="flex min-h-dvh">
          <Sidebar collapsed={collapsed} onToggle={toggle} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileBar />
            <main id="conteudo" className="min-w-0 flex-1">
              {children}
            </main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <QuickTaskDialog open={taskDefaults !== null} onOpenChange={(o) => !o && setTaskDefaults(null)} defaults={taskDefaults ?? {}} />
        <CaptureDialog open={captureOpen} onOpenChange={setCaptureOpen} />
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "!rounded-md !border !border-line !bg-white !text-ink !shadow-float !font-sans",
          }}
        />
      </ConfirmProvider>
    </ShellContext.Provider>
  )
}

/** Celular: barra superior em carvão com menu, busca e criação. */
function MobileBar() {
  const [open, setOpen] = useState(false)
  const createItems = useCreateMenu()
  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-black/20 bg-nav px-2 text-paper md:hidden">
        <button onClick={() => setOpen(true)} className="rounded-sm p-2 text-nav-text hover:bg-nav-2" aria-label="Abrir navegação">
          <MenuIcon className="size-5" />
        </button>
        <div className="flex-1 pl-1">
          <Brand />
        </div>
        <SearchButton />
        <DropdownMenu
          items={createItems}
          trigger={
            <button className="ml-1 flex size-9 items-center justify-center rounded-sm bg-cobalt text-white" aria-label="Criar novo">
              <Plus className="size-5" />
            </button>
          }
        />
      </header>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/40 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:hidden" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-nav text-nav-text shadow-float transition-transform duration-150 data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full md:hidden">
            <Dialog.Title className="sr-only">Navegação</Dialog.Title>
            <div className="flex h-12 items-center justify-between pr-2 pl-4">
              <Brand />
              <Dialog.Close className="rounded-sm p-2 hover:bg-nav-2" aria-label="Fechar navegação">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <NavList collapsed={false} onNavigate={() => setOpen(false)} />
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function SearchButton() {
  const { openPalette } = useShell()
  return (
    <button onClick={openPalette} className="rounded-sm p-2 text-nav-text hover:bg-nav-2" aria-label="Buscar">
      <Search className="size-5" />
    </button>
  )
}
