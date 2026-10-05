/**
 * Varredura do texto das telas do escritório (o que o advogado vê): nenhuma variável
 * de ambiente, nome de serviço/infraestrutura, migração, endereço interno ou código
 * HTTP escrito na interface. Lê o código-fonte com o parser do TypeScript e confere
 * o texto de JSX e as strings com cara de frase — não os nomes de classe, imports,
 * códigos internos ou mensagens de log (`console.*`).
 *
 * Fora da varredura: o Super Admin (`components/admin`, `app/(admin)`), que é a tela
 * de quem opera a Íntegra e mostra o diagnóstico da configuração de propósito.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const ROOT = path.resolve(import.meta.dirname, "../..")
const SCANNED = [
  "components",
  "app/(app)",
  "app/(auth)",
  "app/auth",
  "lib/whatsapp",
  "lib/ai/errors.ts",
  "lib/integrations/legal/errors.ts",
  // Rótulos que aparecem nas telas a partir dos dados (origem, status, tipo).
  "lib/triagem/model.ts",
  "lib/services/processos/labels.ts",
]
const SKIPPED_DIRS = new Set(["components/admin"])

/** Nomes que só podem aparecer no aviso de privacidade (LGPD: com quem os dados são compartilhados). */
const PRIVACY_DISCLOSURE = "components/ai/ai-privacy.tsx"

const FORBIDDEN: { name: string; pattern: RegExp; allowIn?: string[] }[] = [
  { name: "variável de ambiente", pattern: /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/ },
  { name: "configuração do servidor", pattern: /(\.env\b|vari[aá]ve(l|is) de ambiente|ambiente do servidor|no servidor|do servidor)/i },
  { name: "provedor de IA", pattern: /\b(gemini|anthropic|claude|openai|google ai studio)\b/i, allowIn: [PRIVACY_DISCLOSURE] },
  { name: "serviço ou infraestrutura", pattern: /\b(supabase|postgres(ql)?|postgrest|z-?api|datajud|smtp|nodemailer|vercel|next\.?js|realtime)\b/i },
  { name: "banco de dados", pattern: /\b(migra[çc][ãa]o|migrations?\/|sql editor|rls|row[- ]level)\b/i },
  { name: "jargão de integração", pattern: /\b(webhooks?|endpoint|payload|json|stack ?trace|api key|token)\b/i },
  { name: "código HTTP", pattern: /\b(http|status|erro)\s*[1-5]\d\d\b/i },
  { name: "rota interna", pattern: /(^|\s)\/(api|rest|auth\/v1|storage\/v1)\//i },
]

/** Atributos JSX que não são texto para a pessoa ler. */
const NON_TEXT_ATTRIBUTES = new Set([
  "className", "href", "id", "type", "name", "htmlFor", "layoutId", "src", "autoComplete", "inputMode", "variant", "size", "side", "align",
  "role", "key", "mode", "tone", "accept", "pattern", "rel", "target", "method", "action", "form", "data-testid",
])

function files(entry: string): string[] {
  const full = path.join(ROOT, entry)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [entry]
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((item) => {
    const relative = path.posix.join(entry, item.name)
    if (item.isDirectory()) return SKIPPED_DIRS.has(relative) ? [] : files(relative)
    return /\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name) ? [relative] : []
  })
}

const isConsoleCall = (node: ts.Node): boolean => {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText()
      if (/^console\.\w+$/.test(callee)) return true
    }
    if (ts.isBlock(current) || ts.isSourceFile(current)) return false
  }
  return false
}

/** Texto que alguém lê na tela: JSX ou string com espaço (frases), fora de log e de atributos técnicos. */
function visibleTexts(file: string): { line: number; text: string }[] {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: { line: number; text: string }[] = []
  const add = (node: ts.Node, text: string) => found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text })

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isJsxAttribute(node) && NON_TEXT_ATTRIBUTES.has(node.name.getText())) return
    if (ts.isJsxText(node)) {
      const text = node.getText().trim()
      if (text) add(node, text)
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /\s/.test(node.text) && !isConsoleCall(node)) {
      if (!/^[\w\s:[\]()./%&>~*+,#=-]*$/.test(node.text) || /[A-Za-zÀ-ú]{3,}\s+[A-Za-zÀ-ú]{2,}/.test(node.text)) add(node, node.text)
    } else if (ts.isStringLiteral(node) && ts.isPropertyAssignment(node.parent) && node.parent.initializer === node && /^[A-Z][a-z]/.test(node.text)) {
      // Rótulo de uma palavra num mapa (`{ datajud: "DataJud" }`): também é texto de tela.
      add(node, node.text)
    } else if (ts.isTemplateExpression(node) && !isConsoleCall(node)) {
      // Só frases: endereços e nomes montados (`/api/x/${id}`, `cliente-${n}.json`) não têm espaço no texto fixo.
      const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]
      if (/\s/.test(parts.join(""))) add(node, parts.join("…"))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe("texto das telas do escritório", () => {
  const scanned = SCANNED.flatMap(files)

  it("varre as telas de verdade (não uma lista vazia)", () => {
    assert.ok(scanned.length > 100, `só ${scanned.length} arquivos`)
    assert.ok(scanned.includes("components/ai/ai-blocks.tsx"))
    assert.ok(scanned.includes("components/atendimento/connection.tsx"))
    assert.ok(!scanned.some((file) => file.startsWith("components/admin/")))
  })

  it("nenhum detalhe técnico escrito na interface", () => {
    const problems: string[] = []
    for (const file of scanned) {
      for (const { line, text } of visibleTexts(file)) {
        // Classes do Tailwind (ex.: `env(safe-area-inset-bottom)`) não são texto.
        if (/^[\w\s:[\]()./%&>~*+,#=@!-]*$/.test(text) && /(^|\s)(px|py|pt|pb|inset|top|bottom|flex|grid|rounded|text|bg|border)-/.test(text)) continue
        for (const rule of FORBIDDEN) {
          if (rule.allowIn?.includes(file)) continue
          if (rule.pattern.test(text)) problems.push(`${file}:${line} [${rule.name}] ${text.replace(/\s+/g, " ").slice(0, 140)}`)
        }
      }
    }
    assert.deepEqual(problems, [])
  })
})
