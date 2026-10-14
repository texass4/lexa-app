/**
 * Avaliação da recuperação de jurisprudência da IA contra a SUA base real — só leitura.
 *
 *   npm run jurisprudence:eval                               # perguntas de scripts/jurisprudence-eval.queries.json
 *   npm run jurisprudence:eval -- --pergunta="dano moral por atraso na entrega de imóvel"
 *   npm run jurisprudence:eval -- --saida=avaliacao.md       # também grava o relatório em Markdown
 *
 * Lê o `.env.local` (NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY). Para cada
 * pergunta mostra, lado a lado:
 *   TELA        — `search_jurisprudence` com os termos da pergunta, 5 primeiras;
 *   CONCEITOS   — `jurisprudence_ai_candidates` (0022) + classificação lexical (a versão
 *                 anterior da conversa): o que ia à IA e os principais descartes;
 *   COMPARATIVA — análise do caso + consultas por questão (0025) + classificação jurídica
 *                 (a versão atual): o que vai à IA, com posição, distinções e consultas.
 * Só consulta a base PÚBLICA de jurisprudência (nada de escritório). Não grava nada.
 * Não chama o modelo de IA.
 *
 * Acerto só é calculado quando o arquivo de perguntas tem ids revisados em
 * "relevantes"/"irrelevantes" — sem revisão humana, o script mostra e não julga.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { searchTermsFrom } from "../lib/ai/jurisprudence-intent"
import { loggableQuery, planQuery } from "../lib/ai/jurisprudence-query"
import { rankCandidates } from "../lib/ai/jurisprudence-relevance"
import { jurisprudenceRepository } from "../lib/services/jurisprudence/store"
import { QueryCache, retrievePrecedents } from "../lib/ai/jurisprudence-pipeline"

interface EvalQuery {
  pergunta: string
  tema_esperado?: string
  relevantes?: string[]
  irrelevantes?: string[]
}

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("✗ Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local (a chave nunca é mostrada).")
  process.exit(1)
}

const single = arg("pergunta")
const queries: EvalQuery[] = single
  ? [{ pergunta: single }]
  : (JSON.parse(readFileSync(new URL("./jurisprudence-eval.queries.json", import.meta.url), "utf8")) as { consultas: EvalQuery[] }).consultas

const repo = jurisprudenceRepository(createClient(url, key, { auth: { persistSession: false } }))
const out: string[] = []
const print = (line = "") => {
  console.info(line)
  out.push(line)
}
const short = (text: string | undefined, max = 110) => (text && text.length > max ? `${text.slice(0, max)}…` : (text ?? "—"))

/** Acerto entre as primeiras N, contando só o que foi revisado. */
function judge(list: string[], q: EvalQuery) {
  const rel = new Set(q.relevantes ?? [])
  const irr = new Set(q.irrelevantes ?? [])
  if (!rel.size && !irr.size) return "sem revisão (preencha relevantes/irrelevantes para medir)"
  const reviewed = list.filter((id) => rel.has(id) || irr.has(id))
  const hits = list.filter((id) => rel.has(id)).length
  return `${hits} relevante(s) e ${list.filter((id) => irr.has(id)).length} irrelevante(s) revisada(s) entre ${list.length}; ${list.length - reviewed.length} sem revisão`
}

print(`# Avaliação da recuperação de jurisprudência — ${new Date().toISOString().slice(0, 10)}`)
print("")
print("Base: a do Supabase configurado. ANTES = pesquisa que a conversa usava; DEPOIS = candidatas + classificação de pertinência.")

for (const q of queries) {
  const terms = searchTermsFrom(q.pergunta)
  const plan = planQuery(q.pergunta, terms)
  print("")
  print(`## ${q.pergunta}`)
  if (q.tema_esperado) print(`Tema esperado (revisão humana): ${q.tema_esperado}`)
  print(`Termos: "${terms}" · conceitos: ${loggableQuery(plan) || "nenhum"} · ramos: ${plan.branches?.join("/") ?? "sem sinal"}${plan.dropped.length ? ` · fora do teto: ${plan.dropped.join(", ")}` : ""}`)

  const beforeStarted = Date.now()
  const before = await repo.search({ text: terms, filters: {}, sort: "relevance", limit: 5, offset: 0 })
  print("")
  print(`### Antes (${before.total} com algum termo · ${Date.now() - beforeStarted} ms)`)
  before.rows.forEach((r, i) => print(`${i + 1}. ${r.id} · ${r.tribunal} ${[r.classCode, r.processNumber].filter(Boolean).join(" ")} · ${r.judgmentDate ?? "—"} · score ${r.score.toFixed(3)} · ${short(r.subject)}`))
  print(`Acerto: ${judge(before.rows.map((r) => r.id), q)}`)

  if (!plan.concepts.length) {
    print("")
    print("### Depois: a pergunta não tem conceito pesquisável (a conversa diria que falta o tema).")
    continue
  }
  const afterStarted = Date.now()
  const { candidates, matched } = await repo.aiCandidates(plan.groups, {}, 60)
  const ranking = rankCandidates(plan, candidates)
  print("")
  print(`### Conceitos — versão anterior (${matched} com algum conceito · ${candidates.length} candidatas · ${ranking.stats.approved} aprovadas: ${ranking.stats.direct} diretas, ${ranking.stats.related} relacionadas · ${Date.now() - afterStarted} ms)`)
  if (!ranking.selected.length) print("Nada vai à IA: a resposta deve dizer que a pesquisa não encontrou decisões pertinentes.")
  ranking.selected.forEach((r, i) => {
    const d = r.decision
    print(`${i + 1}. [${r.level} · ${r.score}] ${d.id} · ${d.tribunal} ${[d.classCode, d.processNumber].filter(Boolean).join(" ")} · ${d.judgmentDate ?? "—"} · ${short(d.subject)}`)
    print(`   onde: ${r.breakdown.map((b) => `${b.concept}=${b.field ?? "—"}${b.phrase ? "+frase" : ""}${b.broad ? "(amplo)" : ""}`).join("; ")}${r.branch && !r.branch.match ? ` · ramo ${r.branch.decision} (penalizado)` : ""}`)
    if (r.excerpt) print(`   trecho: "${short(r.excerpt.text, 220)}"`)
  })
  print(`Acerto: ${judge(ranking.selected.map((r) => r.decision.id), q)}`)
  const topDiscards = [...ranking.discarded].sort((a, b) => b.score - a.score).slice(0, 5)
  if (topDiscards.length) {
    print("Principais descartes:")
    for (const d of topDiscards) {
      const decision = candidates.find((c) => c.decision.id === d.id)?.decision
      print(`- ${d.id} · ${d.score} · ${d.reason} · ${short(decision?.subject, 90)}`)
    }
  }

  const comparative = await retrievePrecedents(
    { question: q.pergunta },
    {
      candidates: async (groups, filters, limit, options) =>
        options?.required?.length ? repo.issueCandidates(groups, options.required, filters, limit, options.signal) : repo.aiCandidates(groups, filters, limit),
      cache: new QueryCache(),
    },
  )
  print("")
  print(`### Comparativa — versão atual (${comparative.status} · suporte ${comparative.support} · ${comparative.metrics.unique} avaliadas · ${comparative.metrics.ms} ms)`)
  print(`Questões: ${comparative.analysis.issues.map((i) => i.question).join(" | ") || "nenhuma"}`)
  for (const c of comparative.queries) print(`- consulta ${c.kind} (${c.issue}): ${c.concepts.join(" + ")} → ${c.results} · ${c.status}${c.fallback ? " · compatibilidade (0025 ausente)" : ""}`)
  comparative.precedents.forEach((p, i) => {
    const d = p.decision
    print(`${i + 1}. [${p.level} · ${p.score} · ${p.stance}] ${d.id} · ${d.tribunal} ${[d.classCode, d.processNumber].filter(Boolean).join(" ")} · ${d.judgmentDate ?? "—"} · ${short(d.subject)}`)
    if (p.stanceEvidence?.sentence) print(`   posição: "${short(p.stanceEvidence.sentence, 200)}"`)
    if (p.distinctions.length) print(`   distinções: ${p.distinctions.map((x) => x.text).join(" | ")}`)
  })
  print(`Acerto: ${judge(comparative.precedents.map((p) => p.decision.id), q)}`)
}

const file = arg("saida")
if (file) {
  writeFileSync(file, `${out.join("\n")}\n`)
  console.info(`\nRelatório gravado em ${file}`)
}
