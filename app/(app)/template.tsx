/**
 * Entrada de cada tela: fade + deslocamento mínimo (CSS puro, `.page-enter`
 * em globals.css). Remonta a cada navegação — por isso é template e não layout.
 * Com `prefers-reduced-motion`, a animação é anulada pela regra global.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex min-h-0 flex-1 flex-col">{children}</div>
}
