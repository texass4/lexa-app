"use client"

import { AdminShellProvider, type AdminIdentity } from "./admin-context"
import { AdminSidebar } from "./admin-sidebar"
import { AdminDrawer, AdminTopbar } from "./admin-topbar"
import { AdminSearch } from "./admin-search"

/** Moldura do Íntegra Admin: barra lateral escura própria, topo com busca, pendências e perfil. */
export function AdminShell({ admin, children }: { admin: AdminIdentity; children: React.ReactNode }) {
  return (
    <AdminShellProvider admin={admin}>
      <div className="min-h-dvh">
        <a
          href="#conteudo"
          className="fixed top-2 left-2 z-[60] -translate-y-16 rounded-md bg-primary px-3 py-2 text-[13px] text-primary-foreground transition-transform focus:translate-y-0"
        >
          Pular para o conteúdo
        </a>
        <AdminSidebar />
        <div className="flex min-h-dvh min-w-0 flex-col md:pl-[76px] lg:pl-[256px]">
          <AdminTopbar />
          <main id="conteudo" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-20 sm:px-6 lg:px-10 lg:pt-9">
            {children}
          </main>
        </div>
        <AdminDrawer />
        <AdminSearch />
      </div>
    </AdminShellProvider>
  )
}
