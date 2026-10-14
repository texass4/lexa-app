/**
 * Comparação ANTES × DEPOIS da recuperação de jurisprudência da IA nos casos de
 * REFERÊNCIA revisados manualmente (`scripts/jurisprudence-reference/`).
 *
 *   npm run jurisprudence:benchmark -- --memoria                 # sem banco (simulação)
 *   npm run jurisprudence:benchmark -- --sql --ruido=1500 > c.sql # SQL do corpus FICTÍCIO (só base LOCAL)
 *   npm run jurisprudence:benchmark                               # no Supabase do .env.local (busca textual real)
 *   npm run jurisprudence:benchmark -- --saida=relatorio.md
 *
 * O corpus é FICTÍCIO (provider "ficticio"): carregue só numa base local de
 * desenvolvimento e apague depois (`delete from jurisprudence where provider = 'ficticio'`).
 * Nada aqui grava na base, chama o modelo de IA ou lê dados de escritório.
 */
import { writeFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { jurisprudenceRepository } from "../lib/services/jurisprudence/store"
import {
  FICTITIOUS_PROVIDER,
  REFERENCE_CORPUS,
  afterPipeline,
  beforePipeline,
  evaluate,
  inMemoryRetrieve,
  noiseCorpus,
  scoreTable,
  type RetrieveFn,
} from "./jurisprudence-reference/evaluate"

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`))?.split("=")[1] ?? (process.argv.includes(`--${name}`) ? "" : undefined)
const noise = Number(arg("ruido") ?? 0) || 0
const corpus = [...REFERENCE_CORPUS, ...noiseCorpus(noise)]

if (arg("sql") !== undefined) {
  const q = (v: string | undefined | null) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`)
  const lines = ["-- Corpus FICTÍCIO de avaliação. Só para base LOCAL de desenvolvimento.", "begin;", `delete from public.jurisprudence where provider = '${FICTITIOUS_PROVIDER}';`]
  for (const d of corpus) {
    lines.push(
      `insert into public.jurisprudence (id, provider, tribunal, external_id, process_number, class_code, court, rapporteur, judgment_date, publication_date, subject, ementa, decision_text, area, degree, content_hash) values (${[
        q(d.id),
        q(d.provider),
        q(d.tribunal),
        q(d.externalId),
        q(d.processNumber),
        q(d.classCode),
        q(d.court),
        q(d.rapporteur),
        q(d.judgmentDate),
        q(d.publicationDate),
        q(d.subject),
        q(d.ementa),
        q(d.decisionText),
        q(d.area),
        q(d.degree),
        q("ficticio"),
      ].join(", ")});`,
    )
  }
  lines.push("commit;")
  process.stdout.write(`${lines.join("\n")}\n`)
  process.exit(0)
}

let retrieve: RetrieveFn
let where: string
if (arg("memoria") !== undefined) {
  retrieve = inMemoryRetrieve(corpus)
  where = `simulação em memória (${corpus.length} decisões)`
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("✗ Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (a chave nunca é mostrada), ou use --memoria.")
    process.exit(1)
  }
  const repo = jurisprudenceRepository(createClient(url, key, { auth: { persistSession: false } }))
  retrieve = async (groups, filters, limit, options) =>
    options?.required?.length ? repo.issueCandidates(groups, options.required, filters, limit, options.signal) : repo.aiCandidates(groups, filters, limit)
  where = "busca textual do Postgres (funções 0022/0025) no Supabase configurado"
}

const out: string[] = [`# Recuperação de jurisprudência — antes × depois`, "", `Base: ${where}. Casos: scripts/jurisprudence-reference/cases.json.`, ""]
const before = await evaluate(beforePipeline, retrieve, corpus)
out.push(scoreTable("Antes — consulta única por qualquer conceito + classificação lexical", before.scores, before.summary), "")
const after = await evaluate(afterPipeline, retrieve, corpus)
out.push(scoreTable("Depois — questões jurídicas, consultas por questão, classificação jurídica", after.scores, after.summary), "")
out.push("Ids enviados à IA (últimos 3 dígitos; `r…` = ruído):", "")
for (let i = 0; i < before.scores.length; i += 1) {
  const short = (ids: string[]) => ids.map((id) => (id.startsWith("f1") ? `r${Number(id.slice(-6))}` : id.slice(-3))).join(", ") || "—"
  out.push(`- ${before.scores[i].id}: antes [${short(before.scores[i].ids)}] → depois [${short(after.scores[i].ids)}]`)
}
console.info(out.join("\n"))
const file = arg("saida")
if (file) writeFileSync(file, `${out.join("\n")}\n`)
