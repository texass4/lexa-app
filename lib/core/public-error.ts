/**
 * Mensagens de erro que podem aparecer para quem usa a Íntegra.
 *
 * A interface mostra só textos claros e orientados à ação. Qualquer texto que pareça
 * detalhe de implementação (variável de ambiente, chave, nome de serviço ou
 * biblioteca, código HTTP, SQL, caminho de arquivo, endereço interno, stack trace)
 * é trocado por uma mensagem genérica. O detalhe técnico fica só no log do servidor.
 *
 * Roda no servidor (rotas) e no navegador (toasts e formulários): sem dependências.
 */

export const UNEXPECTED_ERROR = "Ocorreu um erro inesperado. Tente novamente."
export const SERVICE_ERROR = "Não foi possível conectar ao serviço. Tente novamente em instantes."
export const OFFLINE_ERROR = "Sem conexão com a Íntegra. Verifique a internet e tente novamente."

const TECHNICAL: RegExp[] = [
  // Variáveis de ambiente e configuração (GEMINI_API_KEY, ZAPI_TOKEN, NEXT_PUBLIC_…).
  /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/,
  /\b(api[ _-]?key|apikey|secret|token|jwt|bearer|service[ _-]?role|anon[ _-]?key|credenciais?)\b/i,
  /(vari[aá]ve(l|is) de ambiente|\.env\b|no servidor|do servidor|ambiente do servidor)/i,
  // Serviços, provedores, bibliotecas e infraestrutura.
  /\b(supabase|postgres(ql)?|postgrest|gotrue|pgrst|gemini|google ai|anthropic|claude|openai|z-?api|datajud|nodemailer|smtp|vercel|next\.?js|node\.?js|turbopack|webpack|prisma|redis)\b/i,
  // Exceções, stack traces e erros de rede do runtime.
  /\b(TypeError|ReferenceError|SyntaxError|RangeError|AbortError|Exception|ECONN\w*|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|EPIPE|fetch failed|undefined|NaN)\b/,
  /\[object \w+\]/,
  /\bnull\b/,
  /\b(failed to fetch|networkerror|load failed|network request failed)\b/i,
  /^\s*(error|erro)\s*:/i,
  // Texto em inglês vem de biblioteca ou serviço, nunca da Íntegra.
  /\b(the|is|was|not|failed|error|invalid|cannot|could|unable|denied|missing|expired|request|response|server|unauthorized|forbidden|internal|timeout|timed out)\b/i,
  /\bat\s+\S+\s+\(?\S+:\d+:\d+\)?/,
  // Banco de dados.
  /\b(relation|column|constraint|violates|duplicate key|row[- ]level security|rls|permission denied for|syntax error|sqlstate|schema|migra[çc][ãa]o|migration|pg_\w+|rpc)\b/i,
  // HTTP, endereços e formatos internos.
  /\b(http|status( code)?|c[óo]digo|code|erro)\s*[1-5]\d\d\b/i,
  /\b(https?:\/\/|wss?:\/\/|localhost|127\.0\.0\.1)/i,
  /(^|[\s(])\/(api|auth|rest|storage|functions|realtime)\//i,
  /\b(webhook|endpoint|payload|stack ?trace|json)\b/i,
  // Caminhos de arquivo e código-fonte.
  /(^|[\s(])(\.{0,2}\/[\w.-]+\/[\w./-]+|[A-Z]:\\[\w\\. -]+)/,
  /\b[\w-]+\.(ts|tsx|js|mjs|cjs|sql)\b/,
  /[{}<>]|=>/,
]

/** Comprimento acima do qual um texto já não é uma mensagem de interface. */
const MAX_LENGTH = 280

/** true quando o texto expõe detalhe técnico e não pode ir para a tela como está. */
export function isTechnicalMessage(text: string): boolean {
  return TECHNICAL.some((pattern) => pattern.test(text))
}

function messageOf(error: unknown): string | undefined {
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return undefined
}

/**
 * Texto seguro para mostrar ao usuário a partir de um erro qualquer (exceção, resposta
 * da API, string). Mensagens próprias da Íntegra passam como estão; o resto vira
 * `fallback`, que deve dizer o que não deu certo e o que fazer.
 */
export function publicMessage(error: unknown, fallback: string = UNEXPECTED_ERROR): string {
  const text = messageOf(error)?.trim()
  if (!text || text.length > MAX_LENGTH || isTechnicalMessage(text)) return fallback
  return text
}

/** Mensagem padrão para um status HTTP, quando a da resposta não pode aparecer. */
export function fallbackForStatus(status: number): string {
  if (status === 401) return "Sua sessão expirou. Entre novamente."
  if (status === 403) return "Você não tem permissão para esta ação."
  if (status === 404) return "Não encontramos este registro."
  if (status === 429) return "Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente."
  if (status === 502 || status === 503 || status === 504) return SERVICE_ERROR
  if (status >= 500) return UNEXPECTED_ERROR
  return "Não foi possível concluir a ação. Confira os dados e tente novamente."
}
