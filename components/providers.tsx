"use client"

import { UIProvider } from "@/lib/store/ui-store"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

/** Provedores globais — valem também para login e painel do Super Admin. Os dados do escritório ficam em `app/(app)/layout.tsx`. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UIProvider>
      <TooltipProvider delay={250}>
        {children}
        <Toaster />
      </TooltipProvider>
    </UIProvider>
  )
}
