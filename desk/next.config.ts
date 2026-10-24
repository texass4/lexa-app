import path from "node:path"
import type { NextConfig } from "next"

// A Mesa é um projeto independente dentro do repositório: sem isto, o Next tomaria a pasta
// de cima (que tem outro package-lock.json) como raiz e carregaria arquivos de lá.
const root = path.resolve(process.cwd())

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: { root },
  outputFileTracingRoot: root,
  // As migrações são lidas do disco na primeira conexão (inclui no pacote de produção).
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  // PGlite carrega arquivos WebAssembly do próprio pacote; o pg tem dependências opcionais nativas.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
}

export default nextConfig
