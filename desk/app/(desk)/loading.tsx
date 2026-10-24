export default function Loading() {
  return (
    <div className="px-6 py-10 md:px-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="h-3 w-24 animate-pulse rounded-xs bg-paper-3" />
      <div className="mt-4 h-9 w-72 max-w-full animate-pulse rounded-xs bg-paper-3" />
      <div className="mt-10 grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-sm bg-paper-2" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  )
}
