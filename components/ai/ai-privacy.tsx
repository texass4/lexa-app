"use client"

import * as React from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { cn } from "cn"
import { Panel } from "@/components/ui/panel"
import { StatusBadge } from "@/components/ui/status-badge"

/**
 * Aviso de privacidade da Íntegra IA: o que usa IA, o que é enviado a provedores
 * externos e para quê. O cartão fica em Configurações › Integrações; a nota curta
 * acompanha cada análise e aponta para ele.
 */

const AI_PRIVACY_HREF = "/configuracoes?secao=integracoes#ia"

/** Uma linha, no rodapé das análises. */
export function AIPrivacyNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11.5px] leading-snug text-subtle", className)}>
      Os dados necessários a esta análise são enviados ao Google (Gemini) para gerar a resposta.{" "}
      <Link href={AI_PRIVACY_HREF} className="underline underline-offset-2 hover:text-foreground">
        Como a Íntegra usa IA
      </Link>
    </p>
  )
}

interface UsageInfo {
  enabled: boolean
  configured: boolean
  provider: string
  usage: { used: number; limit: number | null } | null
}

const FEATURES: [string, string][] = [
  [
    "Painel, processos e clientes",
    "Panorama do escritório, resumo e próximos passos do processo, análise de movimentação, resumo do cliente e chat — só quando alguém pede.",
  ],
  [
    "Triagem",
    'Cada evento novo (intimação do DJEN ou movimentação relevante) é interpretado uma vez, automaticamente, no servidor: resumo, "exige ação?" e o prazo escrito no teor. Nenhum prazo é criado sem confirmação.',
  ],
  ["Central de Atendimento", "Resumos e sugestões de resposta das conversas do WhatsApp, quando alguém pede — processados pela Anthropic (Claude)."],
]

/** Cartão completo, em Configurações › Integrações. */
export function AIPrivacyCard() {
  const [info, setInfo] = React.useState<UsageInfo | null>(null)

  React.useEffect(() => {
    let cancelled = false
    fetch("/api/ai/usage", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setInfo(data))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const active = info?.enabled && info.configured
  return (
    <Panel id="ia" className="flex flex-col gap-4 p-4 sm:col-span-2">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-muted/60 text-foreground">
          <ShieldCheck className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13.5px] font-semibold">Íntegra IA e privacidade</p>
            {info && (
              <StatusBadge tone={active ? "success" : "neutral"} size="sm">
                {active ? "Ligada" : "Desligada"}
              </StatusBadge>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
            A IA ajuda a ler e organizar informações que já estão na Íntegra. Ela não decide nada, não cria prazos nem tarefas sozinha e pode errar:
            confira sempre no original.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 text-[12.5px] sm:grid-cols-3">
        {FEATURES.map(([title, text]) => (
          <div key={title} className="rounded-[10px] border border-border bg-surface-muted/30 px-3 py-2.5">
            <dt className="font-medium">{title}</dt>
            <dd className="mt-0.5 leading-snug text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>

      <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">O que é enviado:</span> só o necessário para a análise pedida — dados do processo ou do
          cliente (número, classe, partes, movimentações, prazos e tarefas cadastrados) ou o teor da intimação. CPF, CNPJ, e-mails e telefones são
          retirados ou mascarados antes do envio, e a IA só recebe o que a pessoa já pode ver na Íntegra.
        </li>
        <li>
          <span className="font-medium text-foreground">Para onde:</span> {info?.provider ?? "Google (Gemini)"}, provedor externo que processa o
          pedido para gerar a resposta, conforme os termos dele. A Central de Atendimento usa a Anthropic (Claude).
        </li>
        <li>
          <span className="font-medium text-foreground">Para quê:</span> resumir, apontar o que exige atenção e sugerir próximos passos. A Íntegra
          registra só a quantidade de uso, tokens e custo — não guarda perguntas nem respostas nesse registro. Análises iguais ficam em cache por até
          12 horas, no banco da Íntegra, separadas por escritório.
        </li>
      </ul>

      {info?.usage && (
        <p className="text-[12px] text-subtle">
          Uso neste mês: {info.usage.used.toLocaleString("pt-BR")}
          {info.usage.limit === null ? " análises (sem limite no plano)." : ` de ${info.usage.limit.toLocaleString("pt-BR")} análises do plano.`}
        </p>
      )}
    </Panel>
  )
}
