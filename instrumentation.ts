export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { ensureSuperAdmin } = await import("@/lib/auth/bootstrap")
  await ensureSuperAdmin().catch((error) => console.error("[LEXA] Falha ao preparar o Super Admin:", error))
}
