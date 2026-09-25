/**
 * Executa `python/datajud.py --events` e devolve as linhas conforme saem.
 *
 * Toda a conversa HTTP com o DataJud (retry, 429, respostas parciais, cache)
 * acontece no script. Aqui só se cuida do processo filho: iniciar, ler o
 * stdout linha a linha, matar em caso de cancelamento ou demora excessiva.
 *
 * Roda apenas no servidor.
 */

import { spawn } from "node:child_process"
import path from "node:path"
import readline from "node:readline"
import type { DataJudSearchResponse } from "@/lib/integrations/legal/datajud/mapper"
import type { LookupErrorLine, LookupEvent } from "./lookup-events"

export interface PythonResultLine {
  type: "result"
  found: boolean
  cnj: string
  tribunal: string
  cached: boolean
  response: DataJudSearchResponse
}

export type PythonLine = LookupEvent | PythonResultLine | LookupErrorLine

const SCRIPT = path.join(process.cwd(), "python", "datajud.py")

/** Teto para o processo inteiro, somando todas as tentativas. */
const HARD_TIMEOUT_MS = Number(process.env.DATAJUD_PYTHON_TIMEOUT_MS) || 5 * 60 * 1000

const pythonBin = () => process.env.PYTHON_BIN?.trim() || (process.platform === "win32" ? "python" : "python3")

export interface PythonLookupOptions {
  signal?: AbortSignal
  /** Vai à fonte mesmo com cache válido (botão "Atualizar"). */
  refresh?: boolean
}

export async function* runPythonLookup(cnj: string, { signal, refresh }: PythonLookupOptions = {}): AsyncGenerator<PythonLine> {
  const args = [SCRIPT, cnj, "--events", ...(refresh ? ["--refresh"] : [])]
  // Sem o ignore, o bundler rastrearia o projeto inteiro por causa do `cwd`.
  // O script entra no pacote por `outputFileTracingIncludes` (next.config.ts).
  const child = spawn(/*turbopackIgnore: true*/ pythonBin(), args, {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    windowsHide: true,
  })

  let spawnError: NodeJS.ErrnoException | undefined
  child.on("error", (error) => {
    spawnError = error
  })

  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-2000)
  })

  const exited = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)))

  let killedBy: "abort" | "timeout" | undefined
  const kill = (reason: "abort" | "timeout") => {
    killedBy ??= reason
    child.kill()
  }
  const onAbort = () => kill("abort")
  signal?.addEventListener("abort", onAbort)
  const timer = setTimeout(() => kill("timeout"), HARD_TIMEOUT_MS)

  let finished = false
  try {
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
    for await (const raw of lines) {
      const text = raw.trim()
      if (!text) continue
      let line: PythonLine
      try {
        line = JSON.parse(text) as PythonLine
      } catch {
        console.warn("[datajud.py] linha ignorada:", text.slice(0, 200))
        continue
      }
      if (line.type !== "event") finished = true
      yield line
    }

    const code = await exited
    if (finished) return

    if (spawnError) {
      console.error("[datajud.py] não foi possível iniciar o Python:", spawnError.code, spawnError.message)
      yield {
        type: "error",
        code: "PROVIDER_NOT_CONFIGURED",
        message: `Não foi possível executar o Python (${pythonBin()}). Instale o Python 3 com "requests" ou defina PYTHON_BIN.`,
      }
      return
    }
    if (killedBy === "timeout") {
      yield { type: "error", code: "TIMEOUT", message: "A consulta passou do tempo máximo e foi interrompida." }
      return
    }
    if (killedBy === "abort") return

    console.error(`[datajud.py] saiu com código ${code} sem resultado. stderr:`, stderr)
    yield { type: "error", code: "UNEXPECTED", message: "O script de consulta terminou sem resultado." }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
    if (child.exitCode === null) child.kill()
  }
}
