# Auditoria de UX — etapa P2

Feita com o app em produção (`next build`) sobre um escritório fictício realista — 42
clientes, 64 processos com movimentações do DataJud, 208 tarefas, 85 prazos, 92
compromissos, 170 lançamentos, 90 documentos, 19 eventos na Triagem e 6 conversas no
WhatsApp —, em 1440 px e 390 px. Nenhum código foi alterado nesta fase.

Legenda: ✅ bom · ⚠️ ajustar · ❌ problema.

## 1. Painel (Dashboard)

| Pergunta | Leitura |
|---|---|
| O que o usuário precisa saber? | O que vence hoje/na semana, o que está atrasado, o que chegou na Triagem, a agenda do dia. |
| Principal ação? | Abrir o item urgente (prazo, tarefa, intimação). |
| O que merece atenção? | A lista "O que merece sua atenção" (sinais calculados dos dados). |
| Secundário? | Contagens totais (clientes, processos), atividade recente, gráfico de receita. |
| Excesso de informação? | ⚠️ Os mesmos números aparecem 3 vezes: frase do topo ("7 pontos precisam de atenção"), faixa da Íntegra ("7 pontos urgentes") e cartões. |
| Espaço desperdiçado? | ⚠️ Quatro cartões grandes (≈150 px) com contagens sem ação: "42 clientes", "58 processos". No celular eles empurram os prazos para depois de 2.000 px. |
| Duplicação? | ❌ O cartão "Financeiro" (R$ 3.400, −93,4%) repete o painel Financeiro logo abaixo. |
| Ação importante difícil de achar? | ❌ **A lista do que merece atenção começa fechada** atrás de "Ver insights". ❌ **A Triagem não aparece no Painel** (só o número no menu). |
| Hierarquia? | ❌ Ordem: processos recentes → agenda → tarefas → financeiro → **prazos** (último). Prazos são o item mais crítico do escritório. |
| Entende o que fazer? | ⚠️ "16 movimentações recentes · 16 podem exigir atenção" é confuso. "−93,4% vs. mês anterior" no dia 6 compara 6 dias com um mês inteiro. |

## 2. Processos

✅ Tabela clara, ordenada pelo próximo prazo, com um sinal por linha (prazo, tarefa atrasada,
movimentação) e paginação. ⚠️ Em 1440 px as 7 abas de filtro e a busca disputam a mesma linha:
as abas são cortadas ("Em recurso · C…") e a busca fica estreita. Detalhe do processo: já
reorganizado no P1 (sem mudanças).

## 3. Triagem

| Pergunta | Leitura |
|---|---|
| Precisa saber | O que chegou, o resumo, se exige ação, qual o prazo sugerido. |
| Principal ação | Confirmar o prazo (quando há sugestão) **ou** decidir que não há prazo. |
| Fluxo | ✅ evento → resumo da IA → exige ação? → sugestão calculada pelas regras → **o advogado confirma** no diálogo → prazo + tarefa. A IA nunca cria prazo (o diálogo é o único caminho). |
| Problemas | ❌ "Confirmar prazo" é o botão principal de **todos** os itens — inclusive "Exige ação: Não" (ciência, movimentação sem prazo), induzindo a criar prazo onde não há. ⚠️ Repetições em cada item: selo "Pendente" na aba "A revisar" (todos são), "Pode exigir uma providência" ao lado de "Exige ação: Sim", "Possível prazo" ao lado de "Prazo sugerido: 21/10", "Próximo passo sugerido" sem dizer qual. ⚠️ No desktop, o item usa ⅓ da largura e os botões ocupam uma linha própria. |

## 4. Atendimento

✅ Caixa de duas colunas, status e não lidas claros, filtros por situação, painel de contexto
do cliente. Nada a mudar ("Conexão indisponível" é só porque o WhatsApp não está configurado
neste ambiente).

## 5. Tarefas

✅ Quadro e lista, minhas/escritório, busca. ❌ O topo diz "3 atrasadas. Comece por elas.", mas
**no quadro as colunas não seguem a data**: a primeira tarefa de "A fazer" vence em 31/10 e as
atrasadas ficam no meio da coluna. Prazos (subpágina): ✅.

## 6. Financeiro

| Pergunta | Leitura |
|---|---|
| Precisa saber | Quanto entrou, quanto falta receber, o que está atrasado e de quem. |
| Principal ação | Cobrar os atrasados; dar baixa no que foi recebido. |
| Problemas | ⚠️ O subtítulo repete exatamente os cartões. ❌ O alerta "15 parcelas em atraso" oferece só "Abrir cliente" (o mais antigo) — **os atrasados ficam numa aba que não está aberta**. ⚠️ Cada linha mostra o selo "Previsto" dentro da aba "A receber" (todas são). ⚠️ "−93,4% vs. setembro" no dia 6 (mês incompleto × mês inteiro). ❌ Não há leitura interpretada ("Análise da Íntegra"). ⚠️ "A receber" não diz quanto entra nos próximos dias. |

## 7–10. Clientes, Agenda, Documentos, Configurações

✅ **Clientes**: tabela com filtros, vínculos e pendências por cliente — bom. ✅ **Agenda**:
resumo do dia + próximo compromisso + semana/mês — bom. ✅ **Documentos**: já revisto no P1
(paginação, filtros, totais). ⚠️ **Configurações**: dois campos "Senha atual" no bloco Acesso
(um para trocar o e-mail, outro para a senha) — compreensível; mantido.

## Consistência visual

| Item | Leitura |
|---|---|
| Botões, inputs, tabelas, modais, drawers, títulos | ✅ mesmos componentes (`Button`, `Field`, `TableShell`, `Modal`, `SideSheet`, `PageHeader`) em todos os módulos. |
| Selos (badges) | ⚠️ Selo de situação repetido onde a aba já diz a situação (Financeiro, Triagem). |
| Filtro "somente meus" | ✅ Agenda e Triagem usam o mesmo botão; o do Painel é a versão compacta do painel. |
| Estados vazios / carregamento | ✅ `EmptyState` e esqueletos em todas as listas. |
| Mensagens de erro | ❌ "Íntegra IA indisponível — Não foi possível concluir a análise. Tente novamente em instantes." aparece quando a IA **não está configurada** e nada foi tentado: o "tente novamente" nunca vai funcionar. |

## O que foi feito (fase 2)

| Tela | Mudança | Por quê |
|---|---|---|
| Painel | "O que merece sua atenção" aberto por padrão (fecha e lembra) | era a resposta principal e estava escondida |
| Painel | Triagem vira sinal (`triageSignal`) e indicador | intimações aguardando decisão não apareciam |
| Painel | 4 cartões → uma faixa com Prazos até domingo, Tarefas, Triagem a revisar, Em atraso — cada um leva à lista filtrada | totais sem ação e duplicação do Financeiro |
| Painel | Ordem: Prazos + Agenda → Tarefas + Financeiro → Processos recentes + Atividade; prazos limitados a 6 | prazos estavam por último |
| Painel | Frase de abertura e faixa sem contagens repetidas | o mesmo número aparecia 3 vezes |
| Painel / Financeiro | Comparação com o **mesmo período** do mês anterior | dia 6 contra mês inteiro mostrava "−93%" |
| Financeiro | Faixa de indicadores (recebido, previsto, a receber em 30 dias, em atraso + inadimplência) e subtítulo fixo | menos espaço; subtítulo repetia os cartões |
| Financeiro | Alerta de atraso abre a aba Em atraso; cliente mais antigo vira link | a ação do alerta levava a outro lugar |
| Financeiro | Sem selo de situação em cada linha | a aba já diz a situação |
| Financeiro | "Análise da Íntegra" sob demanda (`/api/ai/finance/analysis`, `finance.view`) | leitura dos números reais; a IA não cria números |
| Triagem | "Confirmar prazo" só com prazo sugerido (e não em "Exige ação: Não"); ações à direita | botão principal induzia a criar prazo sem base |
| Triagem | Sem selo "Pendente", sem sinais repetidos | ruído em cada item |
| Tarefas | Quadro: pendentes pelo vencimento (atrasadas no topo) | a tela pedia "comece pelas atrasadas" |
| Processos | Busca vai para a linha de baixo abaixo de 1536 px | abas cortadas em 1440 px |
| IA | Aviso de IA não configurada diz que precisa ser configurada | "tente novamente" nunca resolveria |

Validação no app em produção com o escritório fictício: 16/16 verificações de fluxo (Painel, Financeiro,
Triagem — inclusive cancelar e confirmar prazo conferindo o banco —, Tarefas, Processos, Atendimento),
sem erro de página.
