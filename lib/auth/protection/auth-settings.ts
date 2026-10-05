/**
 * O cadastro da Íntegra cria contas pela API de administração (service role). Se o
 * cadastro público do próprio Supabase Auth estiver ligado, qualquer um cria conta
 * chamando o Auth direto — sem limite, desafio nem confirmação da Íntegra. Conferido
 * ao subir o servidor; o aviso fica no log. (Ajuste: Authentication › Sign In /
 * Providers › desligar "Allow new users to sign up".)
 */
export async function warnIfPublicSignupOpen(url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  if (!url || !key) return
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return
    const settings = (await res.json()) as { disable_signup?: boolean }
    if (settings.disable_signup === false) {
      console.warn(
        "[LEXA · segurança] O cadastro público do Supabase Auth está LIGADO: dá para criar contas sem passar pelas proteções da Íntegra. " +
          'Desligue em Authentication › Sign In / Providers › "Allow new users to sign up".',
      )
      return false
    }
    return true
  } catch {
    return undefined
  }
}
