/**
 * Modelos de página. Ficam no código (não no banco): criar a partir de um modelo copia
 * a estrutura para uma página nova, que passa a ser só dela (`pages.template` guarda de
 * qual modelo veio, para referência). Editar a página nunca altera o modelo.
 *
 * Só estrutura e campos a preencher — nenhum conteúdo jurídico pronto: os modelos de
 * caso trazem perguntas para a equipe responder a partir dos autos, não orientação.
 */
import type { DocNode } from "./model"

export type TemplateKey = "branco" | "reuniao" | "semana" | "projeto" | "caso" | "procedimento" | "ideias"

export interface PageTemplate {
  key: TemplateKey
  name: string
  description: string
  /** Título sugerido (a pessoa troca à vontade). */
  title: string
  content: () => DocNode
}

const text = (value: string, marks?: DocNode["marks"]): DocNode => ({ type: "text", text: value, ...(marks ? { marks } : {}) })
const p = (value = ""): DocNode => (value ? { type: "paragraph", content: [text(value)] } : { type: "paragraph" })
const hint = (value: string): DocNode => ({ type: "paragraph", content: [text(value, [{ type: "italic" }])] })
const h = (level: 1 | 2 | 3, value: string): DocNode => ({ type: "heading", attrs: { level }, content: [text(value)] })
const label = (name: string): DocNode => ({ type: "paragraph", content: [text(`${name}: `, [{ type: "bold" }])] })
const item = (value = ""): DocNode => ({ type: "listItem", content: [p(value)] })
const bullets = (...items: string[]): DocNode => ({ type: "bulletList", content: (items.length ? items : [""]).map(item) })
const steps = (...items: string[]): DocNode => ({ type: "orderedList", attrs: { start: 1 }, content: (items.length ? items : [""]).map(item) })
const checks = (...items: string[]): DocNode => ({
  type: "taskList",
  content: (items.length ? items : [""]).map((value) => ({ type: "taskItem", attrs: { checked: false }, content: [p(value)] })),
})
const hr = (): DocNode => ({ type: "horizontalRule" })
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content })

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    key: "branco",
    name: "Página em branco",
    description: "Comece do zero. Digite / para inserir blocos.",
    title: "",
    content: () => doc(p()),
  },
  {
    key: "reuniao",
    name: "Anotações de reunião",
    description: "Participantes, pauta, decisões e próximos passos.",
    title: "Reunião — ",
    content: () =>
      doc(
        label("Data"),
        label("Participantes"),
        h(2, "Pauta"),
        bullets(),
        h(2, "Anotações"),
        p(),
        h(2, "Decisões"),
        bullets(),
        h(2, "Próximos passos"),
        hint("Transforme um item em tarefa para ter responsável e prazo no quadro."),
        checks(),
      ),
  },
  {
    key: "semana",
    name: "Planejamento semanal",
    description: "Prioridades, compromissos e o que fica para a próxima semana.",
    title: "Semana de ",
    content: () =>
      doc(
        h(2, "Prioridades da semana"),
        checks("", "", ""),
        h(2, "Por dia"),
        h(3, "Segunda"),
        bullets(),
        h(3, "Terça"),
        bullets(),
        h(3, "Quarta"),
        bullets(),
        h(3, "Quinta"),
        bullets(),
        h(3, "Sexta"),
        bullets(),
        hr(),
        h(2, "Fica para a próxima semana"),
        bullets(),
      ),
  },
  {
    key: "projeto",
    name: "Planejamento de projeto",
    description: "Objetivo, escopo, etapas, responsáveis e riscos.",
    title: "Projeto: ",
    content: () =>
      doc(
        h(2, "Objetivo"),
        p(),
        h(2, "Escopo"),
        label("Inclui"),
        bullets(),
        label("Não inclui"),
        bullets(),
        h(2, "Etapas"),
        steps("", "", ""),
        h(2, "Tarefas"),
        hint("Digite / e escolha “Nova tarefa” para criar tarefas reais, com responsável e prazo."),
        p(),
        h(2, "Riscos e dependências"),
        bullets(),
      ),
  },
  {
    key: "caso",
    name: "Análise interna de caso",
    description: "Estrutura para a equipe organizar fatos, dúvidas e próximos passos.",
    title: "Análise — ",
    content: () =>
      doc(
        hint("Anotação interna da equipe. Preencha a partir dos autos e dos documentos do cliente."),
        h(2, "Resumo"),
        p(),
        h(2, "Fatos relevantes"),
        bullets(),
        h(2, "Pontos a esclarecer"),
        bullets(),
        h(2, "Documentos a reunir"),
        checks(),
        h(2, "Próximos passos"),
        checks(),
      ),
  },
  {
    key: "procedimento",
    name: "Checklist de procedimento",
    description: "Passo a passo de uma rotina do escritório, para marcar a cada execução.",
    title: "Procedimento: ",
    content: () => doc(label("Quando usar"), label("Responsável"), h(2, "Passos"), checks("", "", ""), h(2, "Observações"), p()),
  },
  {
    key: "ideias",
    name: "Registro de ideias",
    description: "Ideias e melhorias para o escritório, com o que fazer com cada uma.",
    title: "Ideias",
    content: () =>
      doc(
        hint("Uma ideia por item. Quando decidir levar adiante, crie uma tarefa a partir dela."),
        h(2, "Novas"),
        bullets(),
        h(2, "Em avaliação"),
        bullets(),
        h(2, "Aprovadas"),
        bullets(),
        h(2, "Descartadas"),
        bullets(),
      ),
  },
]

export const templateByKey = (key: string | null | undefined) => PAGE_TEMPLATES.find((t) => t.key === key)
