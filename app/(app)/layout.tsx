import { AppShell } from "@/components/layout/app-shell"
import { SessionProvider } from "@/lib/auth/session"
import { DemoStoreProvider } from "@/lib/store/demo-store"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DemoStoreProvider>
        <AppShell>{children}</AppShell>
      </DemoStoreProvider>
    </SessionProvider>
  )
}
