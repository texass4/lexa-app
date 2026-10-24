/** Erros de regra de negócio com mensagem pronta para a interface. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid" | "conflict",
  ) {
    super(message)
    this.name = "AppError"
  }
}

export const notFound = (what: string) => new AppError(`${what} não encontrado(a).`, "not_found")
export const invalid = (message: string) => new AppError(message, "invalid")
export const conflict = (message: string) => new AppError(message, "conflict")

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/** Violação de restrição do PostgreSQL (check, unique, fk) vira mensagem legível. */
export function describeDbError(error: unknown): string | null {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } }
  const code = e?.code ?? e?.cause?.code
  const constraint = e?.constraint ?? e?.cause?.constraint ?? ""
  if (code === "23505") return constraint.includes("tags") ? "Já existe uma tag com esse nome." : "Registro duplicado."
  if (code === "23514") {
    if (constraint.includes("dates_order")) return "A data de início precisa ser anterior ao prazo."
    if (constraint.includes("not_blank")) return "O título não pode ficar vazio."
    return "Dados inválidos."
  }
  if (code === "23503") return "O registro relacionado não existe mais."
  if (code === "22P02" || code === "22007" || code === "22008") return "Valor inválido."
  return null
}
