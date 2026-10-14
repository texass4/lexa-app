# Redesign da Íntegra — progresso

Inventário completo: `docs/design/redesign-inventory.md`.

## Fase atual

**Etapas 1 a 5 concluídas; 6 a 8 parciais; 9 e 10 executadas para o que foi alterado.** Ver pendências abaixo.

## Linha de base (antes de qualquer mudança visual)

- Git: branch `claude/keen-ride-8iewki`, commit `6b5dcfc` (checkpoint autorizado; também em
  `checkpoint/juris-pre-reinicio`). Árvore limpa no início do redesign.
- `npm test`: 768/768 · lint: limpo · typecheck: limpo · build: ok · `test:rls`: 10/10.
- Capturas "antes" de 15 rotas do app + 4 públicas, em 1440×900 e 390×844: sem rolagem horizontal,
  sem erro de console (exceto o 404 esperado na rota inexistente).

## Etapas

| Etapa | Escopo | Situação |
|---|---|---|
| 1 | Auditoria e inventário | concluída |
| 2 | Tokens, componentes compartilhados, shell (barra lateral, barra superior, assistente) | concluída e validada |
| 3 | Dashboard | concluída e validada |
| 4 | Documentos | concluída e validada |
| 5 | Agenda | concluída e validada |
| 6 | Processos, clientes, tarefas, prazos | concluída: detalhe do processo em abas; Clientes, Tarefas e Prazos redesenhados; ficha do cliente ajustada |
| 7 | Jurisprudência e IA (só visual) | parcial: herda tokens; base vazia neste ambiente impede validar resultados |
| 8 | Demais rotas (configurações, financeiro, atendimento, autenticação, admin, erros) | parcial: Configurações › Acesso e painel da autenticação corrigidos; Admin não capturável |
| 9 | Responsividade e polimento | parcial: 1440 e 390 em todas as rotas do app; 1024/1680 nas redesenhadas; 768 não varrido |
| 10 | Validação final e relatório de cobertura | executada (lint, typecheck, 768 testes, build, varredura de rotas) |

## Páginas

Auditadas: 35/35. Situação por rota: coluna "Status" do inventário.

- Redesenhadas e validadas (10): Início, Documentos, Agenda, Processo (detalhe), Clientes, Tarefas, Prazos,
  Entrar, Cadastro e Recuperar senha (painel da marca).
- Ajustadas e validadas sem reestruturação (2): Processos e Cliente (ficha).
- Herdam o novo sistema, validadas sem regressão, redesenho específico pendente (5): Consulta processual,
  Atendimento, Financeiro, Jurisprudência e Configurações (só a seção Acesso foi corrigida).
- Validadas sem interface própria (2): raiz e Triagem (redirecionamentos). Não encontrada (2): validadas.
- Pendentes de captura (14): Erro, Sem acesso, Redefinir senha e as 11 telas do Admin.

## Registro por etapa

### Etapa 2 — sistema de design e shell

- Tokens (`app/globals.css`): paleta #10263D / #2563EB / #F8FAFC / #E2E8F0 / #0F766E / #B45309,
  raios 6–12 px (`--radius-card` 12, `--radius-control` 8), escala tipográfica, fonte Inter
  (`app/layout.tsx`). Tema escuro redefinido com os mesmos papéis. O Admin mantém trilho escuro
  próprio (`.admin-rail-surface`) para não ficar ilegível.
- Barra lateral clara (`sidebar.tsx`, `sidebar-nav.tsx`): módulos, seção **Atalhos** com contagens
  reais (tarefas de hoje, prazos da semana, processos com prazo, documentos), Configurações e
  assinatura Digitaliza no rodapé; recolhível (Ctrl B). Permissões: mesmos `visibleSections` e
  `routePermission`.
- Barra superior (`topbar.tsx`): busca global (⌘/Ctrl K), Perguntar, notificações, **Ajuda**
  (`help-menu.tsx`, só atalhos que existem), perfil.
- Assistente Íntegra (`ai-chat-sheet.tsx`, `side-sheet.tsx`, `app-shell.tsx`): abas Conversa /
  Contexto, linha "Usando dados de …", sugestões e campo de entrada. A partir de 1280 px abre
  **acoplado** à direita (o conteúdo abre 400 px de espaço, sem cobrir a página); abaixo disso,
  painel sobreposto. Só abre por clique — não ocupa a tela quando não é usado.
- Validação: capturas 1440/1024/390 nos temas claro e escuro, sem rolagem horizontal nem erro de
  console; typecheck e lint limpos.

### Etapa 3 — Dashboard

- Quatro indicadores clicáveis (`kpi-cards.tsx`): prazos até domingo, tarefas pendentes,
  compromissos hoje, valor em atraso — cada um com permissão e link para a lista filtrada.
- Agenda em linha do tempo com abas de dias (hoje + 4 dias), horário de início/fim, marcador
  "agora" e avatar do responsável (`today-agenda.tsx`).
- Tarefas com filtros Todas / Atrasadas / Hoje / Amanhã / **Esta semana** (`inTaskTab` em
  `lib/dashboard/dashboard.ts`, com teste), "Só minhas", conclusão inline preservada.
- **Processos recentes** em tabela (`recent-processes.tsx`): situação, responsável, próximo prazo,
  há quanto tempo mudou; no celular vira lista.
- **Visualizações rápidas** (`quick-views.tsx`): listas filtradas que já existem por URL, com a
  contagem real (prazos vencidos, em 30 dias, sem tarefa; tarefas atrasadas, prioridade alta;
  parcelas em atraso).
- Mantidos: resumo da Íntegra e "O que merece sua atenção" (agora começa recolhido; a preferência
  continua salva), prazos da semana, financeiro, movimentações e atividade recentes.
- Componente compartilhado novo: `ChipTabs` (filtros em pílula com navegação por setas).
- Validação: 1440 claro/escuro e 390, sem rolagem horizontal nem erro de console; `npm test` 768/768.

### Etapa 4 — Documentos

- Padrão de gerenciador de arquivos: árvore à esquerda (`documents-tree.tsx`) com Todos, **Recentes**,
  Tipos e Clientes › Processos — derivada das relações reais (o banco não tem pastas); barra da pasta com
  trilha, busca, ordem (recentes, nome, tamanho — com aviso de que vale para os já carregados) e lista/grade
  (preferência salva no navegador); seleção múltipla com **Copiar links** e **Excluir** (com confirmação e
  permissão `documents.edit`); painel de **Detalhes** (`document-details.tsx`) em coluna a partir de
  1536 px e em painel lateral abaixo disso. Visualizar, baixar, copiar link, editar e excluir continuam os
  mesmos. A paginação no banco e as contagens não mudaram.
- `?pasta=recentes` abre a pasta Recentes; o atalho "Documentos recentes" da barra lateral usa esse link e
  mostra a contagem real.

### Etapa 5 — Agenda

- Padrão de calendário: barra lateral com **Novo compromisso**, **minicalendário** (`mini-calendar.tsx`,
  navega por conta própria, marca dias com compromisso conforme os filtros, carrega o mês sob demanda),
  "Somente meus compromissos" e categorias como caixas de seleção com contagem. Navegação Hoje · ‹ › ·
  período · Dia/Semana/Mês. Hoje destacado em azul. Arrastar para remarcar, criar clicando na grade e o
  resumo "Hoje" foram preservados.

### Etapa 6 — Processos, clientes, tarefas

- Detalhe do processo no desktop em abas (**Visão geral**, Movimentações, Prazos e tarefas, Documentos,
  Jurisprudência, Dados, Histórico): de 3.160 px para 1.621 px de altura na visão geral. No celular, as abas
  que já existiam continuam.
- Lista de processos: responsável com avatar, prazo sem quebra de linha.
- Estados "selecionado" unificados no azul de ação (chips, caixa animada, alternadores de Tarefas,
  filtros do Atendimento, categoria da Agenda, etapa da importação de clientes).

### Etapa 6b — Clientes, Tarefas e Prazos

- **Prazos:** a lista virou uma linha por prazo (`PrazoListRow` em `prazos-panel.tsx`) com a data fatal em
  bloco à esquerda (vermelho se vencido, âmbar se próximo), prazo e processo, responsável com avatar, origem,
  data interna e situação da tarefa; "Cumprir" à vista e "Marcar como perdido" / "Abrir processo" no menu
  (mesma confirmação). Os períodos ficam num painel só, como cabeçalhos de seção. Os indicadores deixaram
  de mostrar zero à esquerda ("02" → "2"). O painel de prazos do processo continua com a linha anterior.
- **Tarefas:** resumo com Atrasadas, Para hoje, Prioridade alta e Concluídas (inclui o histórico) — cada um
  abre a lista já filtrada; exibição (Quadro/Lista), escopo (Minhas/Escritório) e busca numa barra, filtros
  da lista numa linha própria (não cortam mais). Quadro, arrastar, conclusão e `?filtro=` preservados.
- **Clientes:** resumo com Clientes ativos, Novos, Com tarefa atrasada e Inadimplentes (este só para quem
  vê o financeiro); cada um aplica o filtro correspondente. Abas, filtros, ordenação, exportar e importar
  preservados.
- **Ficha do cliente:** "Contato principal" não estica mais até o fim da coluna; atividade recente,
  "Última interação" e timeline mostram o processo pelo assunto em vez de "Processo #103065".
- Validação: 1440 (claro e escuro) e 390 px sem rolagem horizontal nem erro de console; lint, typecheck,
  768 testes e build ok.

### Etapa 8 — demais rotas

- Configurações › Acesso: o campo de senha da troca de e-mail só aparece quando o e-mail muda ("Confirme
  com sua senha"); cada ação tem título próprio. Nenhum campo ou regra removido.
- Autenticação: o painel da marca ficou claro com a troca do tema e o logo invertido sumia; agora usa o azul
  profundo da marca (#10263D) com o logo oficial na versão para fundo escuro.

### Validação final

- `npm run lint`: limpo · `npx tsc --noEmit`: limpo · `npm test`: 768/768 · `npm run build`: ok.
- Varredura das 15 rotas do app em 1440×900 e 390×844: rolagem horizontal 0 em todas; nenhum erro de
  console além do 404 esperado na rota inexistente.
- `test:rls` não foi executado de novo: nenhuma migração, política ou consulta ao banco mudou.

## Problemas encontrados

- ~~Configurações › Acesso pede "Senha atual" duas vezes~~ — corrigido.
- ~~Documentos sem navegação por cliente/processo e sem seleção múltipla~~ — corrigido.
- ~~Detalhe do processo com 3.100 px sem navegação interna~~ — corrigido (abas).
- ~~Logo ilegível no painel da autenticação depois da troca de tema~~ — corrigido.
- A troca de tema do logo depende de `tone`; superfícies novas escuras precisam usar `tone="inverse"`.

## Pendências de backend

Ver "Dependências de backend identificadas" no inventário.

## Refinamento visual — diagnóstico (antes das alterações)

| Ponto | O que foi encontrado | Origem | Decisão |
|---|---|---|---|
| "McDonalds" sob a marca | É o nome do escritório (`organizations.name`), digitado no cadastro ou em Configurações › Escritório. Não há seed nem valor fixo com esse nome no repositório. | dado real do escritório | Não alterar o dado. O nome sai do lugar de "subtítulo da marca" (lia-se "Íntegra McDonalds") e passa a aparecer como **escritório atual**, separado do logo. |
| Identificadores processuais | No escritório de teste: 64 números CNJ válidos (dígito verificador confere) e 2 processos sem número, cadastrados à mão. A interface mostrava o código interno "#103065" — ou qualquer texto digitado — no lugar do número, como se fosse oficial. | `processNumberLabel` | CNJ válido → formatado; 20 dígitos com DV errado → "(dígito não confere)"; outro texto → "(fora do padrão CNJ)"; sem número → "Sem número · cód. interno #…". Com teste. |
| Indicador "Prazos até domingo: 13" | Soma os 11 vencidos e os 2 da semana; na tela Prazos, "Até domingo" são só os 2. | rótulo | Rótulo "Prazos a cumprir" com "11 vencidos · 2 até domingo". |
| Indicador "Tarefas pendentes: 60" | Conta o escritório, mas o link abre "Minhas tarefas" (9 atrasadas) e o selo da barra lateral é pessoal. | escopo misturado | Indicador pessoal ("Suas tarefas"), igual ao selo e à tela de destino. |
| Visualizações rápidas de tarefas | Contam o escritório e abrem a lista pessoal. | link | `?escopo=escritorio` na tela Tarefas. |
| Compromissos hoje / Em atraso | Conferem com Agenda e Financeiro › Em atraso. | — | mantidos |
| Agenda vazia | Estado vazio sem ação; o compromisso não abria detalhes; responsável sem foto; local e pessoa misturados numa linha. | componente | Timeline refeita (ver abaixo). |
| Painel da IA | Acoplado a partir de 1280 px com 400 px: com a barra lateral aberta, sobravam ~570 px de conteúdo. | regra de largura | Acopla só quando sobram ≥ 760 px de conteúdo; expandir (560 px) segue a mesma regra, senão vira painel sobreposto. |
| Tipografia | `--subtle` (#7B8A9E) tem contraste 3,5:1 em branco — abaixo de AA para texto pequeno, e é usado em 11–12 px. | token | `--subtle` mais escuro (#64748B, 4,8:1). |
| Repetição de cartões | 10 cartões grandes iguais no Início; a faixa "A Íntegra acompanha…" repete os indicadores. | composição | Indicadores numa faixa compacta; faixa removida — "o que merece atenção" abre pela frase de status do topo; movimentações viram aba da atividade. |

## Refinamento visual — o que mudou

**Início**
- Indicadores numa faixa compacta (título, valor, situação, ação no hover), com regras corrigidas:
  "Prazos a cumprir" (vencidos + até domingo, explicado no rodapé) e "Suas tarefas" (pessoais, como o
  selo da barra lateral e a tela de destino).
- Agenda como área principal (8/12 em telas largas): linha do tempo com horário de início e fim,
  marcador na cor da categoria e linha contínua, marcador "agora" com a hora, situação (Agora / em X
  min / Concluído), tipo, local, responsável com foto ou iniciais, pessoa envolvida, cliente ou
  processo e "Abrir cliente/processo"; clicar abre o detalhe do compromisso (o mesmo da Agenda).
  Dia vazio: ilustração com ícone, explicação e "Novo compromisso" (com permissão) / "Ver a semana".
- Tarefas ao lado, começando nas da pessoa; filtros quebram linha em vez de cortar.
- Faixa "A Íntegra acompanha…" removida: "Ver o que merece atenção" fica na frase de status do topo
  e abre a mesma lista de antes (preferência salva).
- "O que mudou": atividade da equipe e movimentações processuais num painel com duas abas.
- Visualizações rápidas como lista (sem mini-cartões); listas do escritório abrem com
  `?escopo=escritorio` na tela Tarefas.
- Linhas largas não esticam mais os painéis (sem grandes vazios em cartões).
- Erro ao carregar: estado próprio com "Tentar de novo".

**Dados**
- Nome do escritório em bloco próprio ("Escritório · Prado & Lima Advocacia") na barra lateral e na
  gaveta do celular, fora do logo. O dado não foi alterado.
- Número do processo honesto em todas as telas (`processNumberLabel`, com teste).
- Sessão: falha de conexão com o banco mostrava "Acesso desativado — conta sem escritório"; agora
  mostra "Não foi possível conectar" com "Tentar de novo" (`lib/auth/session.tsx`).

**Assistente Íntegra**
- Cabeçalho com o contexto da conversa, "Nova", **expandir/reduzir** (400 ↔ 560 px) e fechar.
- Acoplado só quando sobram ≥ 760 px para a página (descontada a barra lateral); senão abre por cima.
  Medido: 1440 px → 792 px de conteúdo; expandido em 1440 → sobreposto (1192 px de conteúdo);
  1680 expandido → acoplado (872 px). Sem rolagem horizontal em nenhum caso.
- Linha de situação reflete a IA de verdade (verde quando responde; "indisponível" quando não).
- Aba Contexto: "Outras conversas desta sessão" (as conversas por contexto que já existiam,
  agora acessíveis). Sugestões sob o título "Perguntas sugeridas para esta tela".
- Aviso "Íntegra IA indisponível" virou uma linha discreta em todas as telas (antes um cartão).
- Anexos: não existem no produto — nenhum botão foi adicionado.

**Documentos**
- Painel de detalhes com pré-visualização real (PDF ou imagem, via URL temporária); arquivo
  ausente no armazenamento é dito como tal. Grade mostra miniatura real de imagens.

**Global**
- `--subtle` #7B8A9E → #64748B (contraste 3,5:1 → 4,8:1 em fundo branco).

**Admin** (capturado pela primeira vez, com super admin só no ambiente local de teste)
- 11 telas validadas em 1440 e 390 px; corrigido estouro de 9 px em Configurações (selo de credencial).

## Refinamento visual — validação

| Cenário | Resultado |
|---|---|
| Timeline com 7 eventos (dados de teste locais, removidos depois) | rola até "agora", marcador da hora, situações corretas |
| Timeline vazia (Escritório Beta) | estado vazio com ação |
| Usuário com foto (imagem abstrata de teste, removida depois) / sem foto | foto no topo, tarefas e timeline / iniciais |
| Listas vazias (Escritório Beta) e preenchidas | ok |
| Assistente aberto, expandido, contexto e fechado em 1280/1440/1680/390 | sem rolagem horizontal |
| Colaborador sem financeiro (Eduardo) | sem "Em atraso", sem inadimplentes, sem Financeiro no menu, `/financeiro` "Sem acesso" |
| Erro de carregamento (REST bloqueado no navegador) | "Não foi possível conectar" → "Tentar de novo" recupera |
| Rotas do app em 390, 768, 1024, 1440 | rolagem horizontal 0; sem erros de console (exceto o 404 esperado) |
| lint · typecheck · testes · build | limpo · limpo · 769/769 · ok |

**Não validado:** respostas reais da IA (sem chave configurada neste ambiente — só o estado
"indisponível"); resultados da Jurisprudência (base vazia aqui; a integração com o `.db` não foi
tocada); pré-visualização com arquivo real no armazenamento (os documentos de teste não têm arquivo).

## Pendências

- Atendimento, Financeiro, Consulta processual e Jurisprudência: receberam os ajustes globais
  (contraste, aviso da IA, estados); ainda sem revisão específica de hierarquia página a página.
- Diálogos (novo processo, cliente, tarefa, compromisso) e abertura: não revisados um a um.
