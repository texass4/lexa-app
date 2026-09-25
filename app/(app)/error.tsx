"use client"

import { Panel } from "@/components/ui/panel"
import { ErrorState } from "@/components/ui/empty-state"

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel className="mt-4">
      <ErrorState onRetry={reset} />
    </Panel>
  )
}
