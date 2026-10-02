import { AppShell } from "@/components/layout/app-shell"
import { SplashGate } from "@/components/layout/app-splash"
import { SessionProvider } from "@/lib/auth/session"
import { OfficeStoreProvider } from "@/lib/store/office-store"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SplashGate>
      <SessionProvider>
        <OfficeStoreProvider>
          <AppShell>{children}</AppShell>
        </OfficeStoreProvider>
      </SessionProvider>
    </SplashGate>
  )
}
