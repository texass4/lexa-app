import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-muted before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent dark:before:via-white/5",
        className,
      )}
      {...props}
    />
  )
}

function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("rounded-[14px] border border-border bg-card p-5", className)}>
      <Skeleton className="h-3.5 w-32" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-2.5 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[14px] border border-border bg-card p-4.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-7 w-20" />
          <Skeleton className="mt-3 h-2.5 w-28" />
        </div>
      ))}
    </div>
  )
}

function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="flex gap-6 border-b border-border px-5 py-3">
        {[28, 16, 12, 16, 14].map((w, i) => (
          <Skeleton key={i} className="h-2.5" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-border px-5 py-3.5 last:border-0">
          <div className="flex w-[28%] items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3 flex-1" />
          </div>
          <Skeleton className="h-3 w-[16%]" />
          <Skeleton className="h-3 w-[12%]" />
          <Skeleton className="h-3 w-[16%]" />
          <Skeleton className="h-5 w-[10%] rounded-md" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonStats, SkeletonTable }
