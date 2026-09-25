"use client"

import { DemoStoreProvider } from "@/lib/store/demo-store"
import { UIProvider } from "@/lib/store/ui-store"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DemoStoreProvider>
      <UIProvider>
        <TooltipProvider delay={250}>
          {children}
          <Toaster />
        </TooltipProvider>
      </UIProvider>
    </DemoStoreProvider>
  )
}
