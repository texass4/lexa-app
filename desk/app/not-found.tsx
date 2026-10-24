import Link from "next/link"

export default function NotFound() {
  return (
    <div className="grid-paper flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">Não encontrado</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-3">Este registro não existe ou foi excluído.</p>
      <Link href="/" className="mt-6 text-sm text-cobalt-ink underline underline-offset-4">
        Voltar ao início
      </Link>
    </div>
  )
}
