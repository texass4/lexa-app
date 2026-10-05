/**
 * IP de quem fez a requisição, pelo cabeçalho do proxy/CDN da hospedagem (na Vercel,
 * `x-forwarded-for` é preenchido pela plataforma). Atrás de outro proxy, confira se
 * ele substitui o cabeçalho — senão o IP pode ser forjado e o limite por IP enfraquece.
 */
export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip")?.trim() || undefined
}
