import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  devIndicators: false,
  // As rotas de processo executam `python/datajud.py`: o script precisa ir junto no deploy.
  outputFileTracingIncludes: {
    "/api/processes/**": ["./python/**/*.py"],
  },
}

export default nextConfig
