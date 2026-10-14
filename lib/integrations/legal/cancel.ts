/**
 * Cancelamento pelo chamador (ex.: prazo da fonte no workflow da consulta processual).
 *
 * Um sinal abortado quer dizer "pare": o cliente não começa nova tentativa, não espera o
 * próximo backoff e não busca outra página. Diferente do prazo de cada tentativa, que
 * continua sendo do próprio cliente.
 */

import { LookupError } from "./errors"

export const cancelledError = () => new LookupError("TIMEOUT", "consulta cancelada pelo chamador (prazo)")

export function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw cancelledError()
}

/** Sinal de uma tentativa: o prazo dela e, se houver, o cancelamento do chamador. */
export const attemptSignal = (timeoutMs: number, signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)

/** Espera (backoff) que termina na hora se o chamador cancelar. */
export function pause(ms: number, sleep: (ms: number) => Promise<void>, signal?: AbortSignal): Promise<void> {
  throwIfCancelled(signal)
  if (!signal) return sleep(ms)
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(cancelledError())
    signal.addEventListener("abort", onAbort, { once: true })
    sleep(ms).then(
      () => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      },
      (error) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}
