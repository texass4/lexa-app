import type { Metadata } from "next"
import { authConfig } from "@/lib/auth/session"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Entrar" }
export const dynamic = "force-dynamic"

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams
  const config = authConfig()
  return (
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-nav p-10 text-paper md:flex">
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,#F2F0E9_1px,transparent_0)] [background-size:22px_22px]" aria-hidden />
        <div className="relative flex items-baseline gap-2">
          <span className="font-serif text-3xl">Mesa</span>
          <span className="size-2 rounded-full bg-cobalt" />
        </div>
        <div className="relative max-w-md">
          <p className="font-serif text-[2.6rem] leading-[1.08] tracking-tight">Um lugar para pensar, decidir e fazer.</p>
          <p className="mt-4 text-nav-text">Tarefas, diário, páginas, projetos e quadros visuais — um registro só para cada coisa, ligado a tudo o que importa.</p>
        </div>
        <p className="relative font-mono text-[11px] tracking-[0.12em] text-nav-muted uppercase">Centro de comando pessoal</p>
      </section>
      <section className="flex items-center justify-center bg-paper px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <span className="font-serif text-3xl">Mesa</span>
          </div>
          <p className="eyebrow">Acesso privado</p>
          <h1 className="mt-2 font-serif text-3xl text-ink">Entrar</h1>
          {config.ok ? (
            <LoginForm next={typeof next === "string" ? next : "/"} />
          ) : (
            <div role="alert" className="mt-6 rounded-md border border-amber/40 bg-amber-soft px-4 py-3 text-sm text-ink-2">
              <p className="font-medium">A Mesa ainda não foi configurada.</p>
              <p className="mt-1">{config.reason} Veja o arquivo <code className="font-mono text-xs">.env.example</code>.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
