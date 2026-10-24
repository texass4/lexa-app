"use client"

import { useActionState } from "react"
import { loginAction, type LoginState } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-3">Senha</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="field h-11"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </label>
      {state.error ? (
        <p id="login-error" role="alert" className="text-sm text-clay">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="ink" className="h-11 justify-center" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  )
}
