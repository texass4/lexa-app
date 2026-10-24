/** Junta classes condicionais (sem dependência extra). */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ")
}
