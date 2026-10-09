/**
 * Contexto do "Resumir com a Íntegra" da Consulta processual: SÓ o relatório já
 * consultado (nenhuma fonte nova). Cada fonte vira uma referência (Q1, Q2…) e cada
 * decisão de jurisprudência, J1, J2…; o que faltou vai explicitamente como ausente.
 */

import { SOURCE_STATUS_LABEL, type EnrichmentRun, type SourceId } from "@/lib/services/consulta/types"
import { type BuiltContext, SourceRegistry, fmtDate, fmtDateTime } from "./shared"

const LIMITS = { parties: 20, lawyers: 20, movements: 15, communications: 5, excerpt: 300 } as const

const cut = (text: string | undefined, max: number) => (text && text.length > max ? `${text.slice(0, max)}…` : text)
const utcToLocal = (iso?: string) => (iso ? fmtDateTime(new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T")) : undefined)

export function buildEnrichmentContext(run: EnrichmentRun): BuiltContext {
  const report = run.report!
  const registry = new SourceRegistry()
  const refOf = new Map<SourceId, string>()
  for (const s of run.sources) {
    if (s.status !== "ok") continue
    refOf.set(
      s.id,
      registry.add("consulta", {
        id: `${run.id}:${s.id}`,
        label: s.name,
        date: s.checkedAt,
        href: s.id === "cadastro" && run.processId ? `/processos/${run.processId}` : `/processos/consulta?execucao=${run.id}`,
      }),
    )
  }
  const ref = (source: SourceId) => refOf.get(source) ?? source

  const context = {
    numero: report.number,
    consulta_em: utcToLocal(report.generatedAt),
    fontes: run.sources.map((s) => ({
      ref: refOf.get(s.id),
      nome: s.name,
      papel: s.role,
      situacao: SOURCE_STATUS_LABEL[s.status],
      consultada_em: utcToLocal(s.checkedAt),
      campos: s.fields,
    })),
    resumo: {
      titulo: report.summary.title,
      tribunal: report.summary.tribunal,
      orgao_julgador: report.summary.unit,
      situacao: report.summary.situation,
      ultima_movimentacao: report.summary.lastMovement ? `${fmtDateTime(report.summary.lastMovement.at)} — ${report.summary.lastMovement.title}` : undefined,
      total_de_movimentacoes: report.summary.movementsTotal,
    },
    dados_processuais: report.fields
      .filter((f) => f.values.length)
      .map((f) => ({ campo: f.label, valores: f.values.map((v) => ({ valor: v.value, fonte: ref(v.source), observacao: v.note })), divergencia: !!f.conflict })),
    partes: report.parties.items.slice(0, LIMITS.parties).map((p) => ({ nome: p.name, polo: p.pole, fonte: ref(p.source), publicada_em: fmtDate(p.date) })),
    advogados: report.parties.lawyers.slice(0, LIMITS.lawyers).map((l) => ({ nome: l.name, inscricao_oab: l.oab, fonte: ref(l.source) })),
    observacao_partes: report.parties.note,
    magistrado: {
      orgao_julgador: report.magistrate.unit?.value,
      mencoes: report.magistrate.mentions.map((m) => ({ nome: m.name, papel_no_texto: m.roleLabel, data: fmtDate(m.date), fonte: ref(m.source), trecho: cut(m.excerpt, LIMITS.excerpt) })),
      observacao: report.magistrate.note,
    },
    movimentacoes_recentes: report.movements.items
      .slice(0, LIMITS.movements)
      .map((m) => ({ data: fmtDateTime(m.at), nome: m.title, descricao: m.description, orgao: m.unit, fonte: ref("datajud") })),
    comunicacoes_recentes: report.communications.items
      .slice(0, LIMITS.communications)
      .map((c) => ({ data: fmtDate(c.date), tipo: c.type, documento: c.documentType, orgao: c.unit, trecho: cut(c.excerpt, LIMITS.excerpt), fonte: ref("djen") })),
    jurisprudencia: report.jurisprudence.items.map((j) => ({
      ref: registry.add("jurisprudence", { id: j.id, label: j.label, date: j.date, href: j.href }),
      decisao: j.label,
      data: fmtDate(j.date),
      trecho_da_ementa: cut(j.excerpt, LIMITS.excerpt),
    })),
    divergencias: report.conflicts.map((c) => ({ campo: c.label, valores: c.values.map((v) => `${v.value} (${ref(v.source)})`) })),
    cadastro_do_escritorio: report.office
      ? { campos: report.office.fields.map((f) => ({ campo: f.label, escritorio: f.office, fonte_publica: f.source, diverge: f.differs })), segredo_de_justica: report.office.secret }
      : undefined,
    informacoes_indisponiveis: report.unavailable.map((u) => `${u.label}: ${u.reason}`),
    avisos: report.notices,
  }

  return {
    context,
    sources: registry.sources,
    basis: `Somente a consulta de ${utcToLocal(report.generatedAt) ?? "agora"} (${run.sources.filter((s) => s.status === "ok").length} fonte(s) com dados).`,
  }
}
