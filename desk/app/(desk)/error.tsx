"use client"

import { Button } from "@/components/ui/button"

export default function DeskError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start px-6 py-20">
      <p className="eyebrow text-clay">Erro</p>
      <h1 className="mt-2 font-serif text-3xl text-ink">Algo deu errado ao abrir esta tela</h1>
      <p className="mt-2 text-sm text-ink-3">Nenhum dado foi alterado. Tente de novo; se continuar, verifique a conexão com o banco de dados.</p>
      {error.digest ? <p className="meta mt-3">Código: {error.digest}</p> : null}
      <Button variant="primary" className="mt-6" onClick={reset}>
        Tentar de novo
      </Button>
    </div>
  )
}
