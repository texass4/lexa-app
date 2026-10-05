/** Erro com status HTTP e mensagem segura para mostrar a quem chamou (`route` em `server.ts`). */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
