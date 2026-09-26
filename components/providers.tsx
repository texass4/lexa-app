"use client"

import { MotionConfig } from "framer-motion"
import { UIProvider } from "@/lib/store/ui-store"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

/** Provedores globais — valem também para login e painel do Super Admin. Os dados do escritório ficam em `app/(app)/layout.tsx`. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // `reducedMotion="user"`: as animações do framer-motion seguem o prefers-reduced-motion do sistema
    // (as de CSS já são anuladas em globals.css).
    <MotionConfig reducedMotion="user">
      <UIProvider>
        <TooltipProvider delay={250}>
          {children}
          <Toaster />
        </TooltipProvider>
      </UIProvider>
    </MotionConfig>
  )
}
