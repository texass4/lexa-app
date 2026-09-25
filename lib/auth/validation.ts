export const MIN_PASSWORD = 8

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export const normalizeEmail = (v: string) => v.trim().toLowerCase()

/** Mensagem de erro para uma senha nova, ou undefined se estiver ok. */
export function passwordProblem(password: string) {
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha."
  return undefined
}

/** Caminho interno seguro para redirecionar depois do login (nunca outro domínio). */
export function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback
}
