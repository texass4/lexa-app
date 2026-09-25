/**
 * Resolver para `node --test`.
 *
 * O Node roda os arquivos `.ts` direto (type stripping nativo), mas não conhece
 * o alias `@/` do tsconfig nem importa caminhos sem extensão. Este hook cobre
 * os dois casos para que os testes usem exatamente os mesmos imports do app.
 */

import { existsSync, statSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

function firstExisting(basePath) {
  for (const suffix of SUFFIXES) {
    const candidate = basePath + suffix
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href
    }
  }
  return null
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const url = firstExisting(path.join(root, specifier.slice(2)))
    if (url) return { url, shortCircuit: true }
  }

  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL))
    const url = firstExisting(path.resolve(parentDir, specifier))
    if (url) return { url, shortCircuit: true }
  }

  return next(specifier, context)
}
