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

## Fidelidade à referência aprovada — discrepâncias (antes)

Comparação na mesma medida da referência (1536 × 1024), com o assistente aberto.

| Área | Referência | Implementação atual |
|---|---|---|
| Proporções | barra lateral ~240 · centro ~880 · IA ~390; o centro mantém 2 colunas | 248 · 888 · 400, mas o centro **empilha** (quebras em 896 px de container + 80 px de margem interna) |
| Cabeçalho | bloco de boas-vindas com imagem ambiental clara à direita, saudação 26 px, subtítulo, seletor de data no canto | só texto: data em sobrelinha, saudação 32 px, sem imagem |
| Indicadores | 4 cartões separados numa linha, ícone em quadro suave de 40 px, valor 26 px, situação com seta, "Ver todos →" | faixa única em 2 × 2 (por causa da largura), sem "Ver todos" |
| Agenda × tarefas | lado a lado (~58% / 42%) | agenda em largura total, tarefas abaixo |
| Timeline | linhas compactas: hora · trilho colorido · **avatar 36 px** · título/linha secundária · etiqueta de tipo · chevron | cartões grandes com borda por evento, avatar 24 px dentro do cartão |
| Abas de dia | "Hoje" preenchida em azul, demais em contorno | pílulas iguais com contagem |
| Tarefas | abas segmentadas; caixa, título, linha do processo, prioridade colorida, data à direita; sem avatar | pílulas com contagem, avatar e chevron por linha |
| Processos recentes | tabela: ponto de alerta · ícone de documento · número · assunto · última movimentação (data) · situação | título humano + número, situação, prazo, "mudou há" |
| Visualizações rápidas | ícone colorido em quadro, título + quantidade como subtítulo, chevron | quantidade à direita, ícones neutros/vermelhos |
| Assistente | aberto ao entrar; cabeçalho compacto; contexto com ponto verde; cartão de saudação; 4 ações em grade 2 × 2; "Sugestões para você" em cartões; caixa de entrada delimitada com botões; rodapé de confiança com "Saiba mais" | fechado ao entrar; quando a IA não está configurada, só o aviso; sem saudação nem ações |
| Densidade | blocos compactos, sem vazios | cartões altos e espaço vazio na agenda |
| Rodapé da barra lateral | "Digitaliza — Tecnologia que impulsiona a advocacia" | "Digitaliza — Íntegra é um produto Digitaliza" |

Mantido de propósito (diferente da referência): bloco "Escritório" sob o logo (o nome do escritório não pode
voltar a parecer subtítulo da marca), botão "Perguntar" e "+ Novo" (ações reais), selo "BETA" **não** adicionado
(não é estratégia confirmada do produto), dados e títulos dos registros sem alteração.

## Fidelidade à referência — o que mudou

Primeira passagem (componentes) e segunda passagem (comparando a tela real, em 1536 × 1024, com a referência).

| Área | Ajuste |
|---|---|
| Composição | Abaixo do cabeçalho, duas colunas que empilham por conta própria (7 + 5): **Agenda → Processos** à esquerda, **Tarefas → Visualizações** à direita, como na referência. Uma agenda curta não deixa mais vão ao lado das tarefas. Numa coluna (celular, ou assistente acoplado em 1440), a ordem segue a prioridade: Agenda, Tarefas, Processos, Visualizações. "O que mudou", "Prazos da semana" e Financeiro continuam abaixo. |
| Cabeçalho | Bloco de boas-vindas sobre superfície clara com a ilustração local `public/brand/ambiente-escritorio.svg` (planta, notebook, caneca; vetorial, sem imagem remota, some abaixo de 672 px de conteúdo); "Bom dia, {nome}!" + subtítulo da referência; data com ícone (abre a Agenda) e "+ Novo" no canto. A linha de pontos de atenção e "Ver o que merece atenção" continuam. |
| Indicadores | 4 cartões separados (uma linha a partir de 672 px de conteúdo, dois no celular), ícone em quadro azul suave de 40 px, valor 26 px (22 px no celular, sem cortar "R$ 61.900"), situação com seta quando pede ação, "Ver todos →". Mesmas contas de antes. |
| Agenda | Abas de dia com "Hoje" preenchida em azul; timeline em linhas: hora (e "em 7h", "agora", "concluído") · trilho na cor da categoria · avatar 36 px do responsável · título · local • com quem • processo/cliente · etiqueta da categoria · chevron. Resumo numa linha própria; "Ver calendário completo" alinhado ao título. A linha abre o detalhe do compromisso, como antes. |
| Tarefas | Controle segmentado numa só faixa (Todas · Atrasadas · Hoje · Amanhã · Semana), com contagem só nas atrasadas, em vermelho (as demais ficam no título da aba); linhas com caixa, título, linha do processo/cliente, prioridade (Alta vermelho, Média âmbar, Baixa verde) e data à direita (vermelha quando vencida ou hoje). "Só minhas" desceu para o rodapé do cartão, ao lado de "Mais N em Tarefas". |
| Processos recentes | Tabela: ponto vermelho quando o próximo prazo está vencido ou próximo (detalhe no título do ponto) · ícone · número · assunto · movimentação (data) · situação. Abaixo de 1024 px de conteúdo (assistente aberto, celular) o assunto vai para a segunda linha sob o número em vez de espremer a coluna. |
| Visualizações rápidas | Quadro de ícone colorido, título, quantidade como subtítulo (vermelho quando pede ação) e chevron. |
| Assistente Íntegra | **Abre sozinho no Início** quando cabe acoplado (≥ 760 px de conteúdo ao lado), até a pessoa abrir ou fechar por conta própria; quem fechar não o vê abrir de novo (preferência `lexa:assistant:closed` no navegador). Abrir não consulta o modelo. Em outras rotas continua fechado até ser chamado. Cartão "Olá, {nome}!", grade 2 × 2 de ações, "Sugestões para você", caixa "Digite sua pergunta…" com enviar azul, rodapé "A IA usa apenas os dados aos quais você tem acesso… Saiba mais" (leva a Configurações › Integrações). Com a IA indisponível, tudo aparece desabilitado, com o aviso — nada finge funcionar. |
| Barra lateral | Rodapé "Digitaliza — Tecnologia que impulsiona a advocacia". |
| Espaçamento | Margem interna do conteúdo de todas as páginas internas: 24 px (era maior), para caber o centro em duas colunas ao lado do assistente. |

### Arquivos alterados

`components/dashboard/dashboard-view.tsx`, `greeting.tsx`, `kpi-cards.tsx`, `today-agenda.tsx`, `open-tasks.tsx`,
`recent-processes.tsx`, `quick-views.tsx`, `chip-tabs.tsx`, `panel-link.tsx`; `components/ai/ai-chat-sheet.tsx`,
`lexa-ai-provider.tsx`, `ai-privacy.tsx`; `components/layout/app-shell.tsx`, `sidebar.tsx`; novo
`public/brand/ambiente-escritorio.svg`. Nenhuma alteração de banco, seeds, APIs ou regras de cálculo.

### Validação

- `npm run lint`, `npx tsc --noEmit`, `npm test` (769 aprovados), `npm run build`: sem erros.
- Rolagem horizontal medida em 390, 768, 1024, 1280, 1440, 1536 e 1680 px em Início, Processos, Clientes, Agenda,
  Tarefas, Documentos, Financeiro e Configurações: 0 px em todas; nenhum erro de página.
- Assistente: aberto ao entrar em 1440/1536/1680; fechado em 1280 ou menos (não cabe acoplado).

### Diferenças que permanecem (intencionais ou por dados)

- Dados reais em vez dos da referência: no escritório de teste há 1 compromisso hoje, então a agenda é curta; os
  títulos de agenda e tarefas são os cadastrados (não foram alterados).
- O responsável aparece com iniciais quando não há foto cadastrada; nenhuma foto genérica foi usada.
- A IA local não está configurada: o painel mostra o aviso e as ações desabilitadas (na referência estão ativas).
- Sem selo "BETA" e sem botões de anexo/ditado extras na caixa de entrada (só o microfone, quando a IA está pronta).
- Mantidos: bloco "Escritório" sob o logo, "Perguntar" na barra superior, contadores na barra lateral, aba
  "Atrasadas" nas tarefas, "O que mudou", "Prazos da semana" e Financeiro abaixo das quatro áreas da referência.
- A ilustração do cabeçalho é vetorial e local, não a fotografia da referência.
- Em 1440 px com o assistente aberto, o centro fica com 744 px: as áreas ficam em uma coluna (duas colunas
  espremeriam as tarefas).

## Central de Documentos (gerenciador de arquivos)

Padrão Dropbox/Google Drive sobre o modelo real: cada documento já guarda categoria, cliente, processo e
arquivo. A navegação usa isso — **Clientes › processo** são vínculos reais (navegáveis como pastas, com
ícone próprio, distinto dos arquivos), **categorias são filtros** (etiquetas, não pastas). Não há pastas
criadas pela pessoa nem lixeira: proposta em `redesign-inventory.md`, sem implementação.

- **Navegação:** Todos, Recentes, Favoritos, Clientes (expansível até os processos), Categorias; contagens
  só quando exatas (janela na memória + contagem no banco); uso do armazenamento. No celular e no tablet,
  em gaveta.
- **Barra:** trilha clicável, busca (no banco, em todo o histórico; indicador e "limpar"), filtros
  combináveis com chips removíveis (categoria, formato, cliente, processo, enviado por, período — todos
  aplicados também no banco), ordem com direção, lista/grade. Lugar e filtros ficam na URL.
- **Lista e grade:** colunas que se adaptam à largura real da área (container `files`), nome como
  elemento principal, miniaturas reais (imagem e 1ª página do PDF, só quando o item aparece, até 12 MB),
  ícones por formato. Clique: detalhes; duplo clique ou "Abrir": visualizador; Shift+clique: intervalo;
  clique direito: o mesmo menu do ⋯. Ações rápidas no hover sem mudar o layout.
- **Seleção múltipla:** barra flutuante com Baixar, Favoritar, Copiar links, Mover, Excluir (conforme
  permissão); Esc limpa.
- **Detalhes:** coluna ao lado (≥ 1180 px de área) ou painel; metadados reais, "Alterado em" do banco,
  local na Central e atividade ligada ao documento (registrada a partir de agora com `documentId`).
- **Visualizador:** tela inteira, URL assinada temporária; PDF pelo pdf.js (páginas, zoom, teclado),
  imagem com zoom, texto até 2 MB; Word e arquivos ausentes com mensagem e download.
- **Envio:** vários arquivos, validação de formato e tamanho por arquivo, destino (categoria obrigatória,
  cliente, processo — padrão do lugar atual), arrastar para a área; bandeja global com progresso real
  (XHR), registrando → concluído só após o banco, cancelar, tentar de novo; arquivo de registro falho é
  removido do Storage. Substitui a barra de progresso animada (falsa) do diálogo anterior.
- **Favoritos:** por pessoa, `0026_documentos_favoritos.sql` (RLS por pessoa e escritório). Sem a migração,
  aparecem como indisponíveis.

Validado no navegador (Supabase local, dados reais): envio de PDF/PNG/TXT com recusa de .xlsx, falha de rede
com nova tentativa, cancelamento a 18% de 19,6 MB, miniaturas, visualizador (3 páginas, zoom), detalhes,
seleção, favoritos, busca no histórico, filtros + URL + recarregar, ordem, renomear, mover, Clientes ›
cliente › processo, menu de contexto, exclusão com confirmação; 390–1680 px sem rolagem horizontal; leitor
(`documents.view`) sem ações de edição na tela e barrado no banco/Storage; outro escritório sem acesso a
registro, arquivo, URL assinada ou favorito. Não validado ponta a ponta: o build de produção (`next start`)
— o login não concluiu nesse modo neste ambiente; o worker do pdf.js foi conferido no build (arquivo próprio,
referenciado).

## Tarefas (quadro, lista e calendário)

Trello no quadro, Notion na lista e nas propriedades, Linear no painel e no teclado — sobre o modelo real
(`tasks` e `task_columns` em jsonb, RLS por `tasks.view`/`tasks.edit` e escritório). Modelo puro e testado em
`lib/tarefas/workspace.ts` (filtros, indicadores, URL, coluna da tarefa, ordenação, calendário).

- **Cabeçalho e indicadores:** Atrasadas, Para hoje, Prioridade alta, Concluídas (inclui o histórico do
  banco), no escopo atual; clicar aplica o filtro (chip removível, na URL) sem trocar a visão; concluídas
  nunca contam como atrasadas; resumo recolhível.
- **Barra de visões:** Quadro · Lista · Calendário (1/2/3) e Minhas tarefas · Escritório; busca (/) no
  histórico; filtros combináveis (situação, status, prioridade, prazo, responsável, cliente, processo).
  Links antigos (`?filtro=atrasadas|hoje|alta|concluidas`, `?escopo=escritorio`) continuam funcionando.
- **Quadro:** colunas reais com contagem exata (inclui concluídas antigas), cor, renomear (duplo clique ou
  menu), mover para esquerda/direita, recolher (por pessoa), excluir escolhendo a coluna de destino —
  nenhuma tarefa é perdida; tarefas de coluna inexistente aparecem na coluna do status, em vez de sumirem.
  Arrastar grava o status (coluna de concluídas conclui; sair dela reabre), com destaque da área e
  "Desfazer"; alternativa por menu/teclado "Mover para…". Criação rápida na coluna (título, prazo).
- **Lista:** colunas escolhidas pela pessoa, ordem por cabeçalho, edição na linha (status, prioridade,
  responsável, prazo), seleção (Shift para intervalo, X no teclado), ações em lote (status, responsável,
  prioridade, concluir, excluir com confirmação), J/K/↑/↓ e Enter.
- **Calendário:** mês com hoje em destaque, atrasadas em vermelho, concluídas riscadas, "+N mais", "+" no
  dia cria com a data; no celular vira agenda dos dias com prazo. Sem horário inventado.
- **Painel de detalhes:** título editável, status, prioridade, responsável, prazo (data e hora), vínculo com
  cliente/processo (e link), tipo (prazo processual, processo, cliente, interna), criada por/em, concluída
  em, descrição, checklist com progresso, contexto do processo, atividade da tarefa (registrada a partir de
  agora). Tarefa não vira prazo processual; o selo "Prazo" só aparece quando há prazo ligado.
- **Persistência:** aviso de sucesso só depois que o banco confirma (`confirmSaved`/`saveNewTask`); falha
  volta a tela ao estado do banco com aviso; criação não duplica (trava "Salvando…" e id único).

Validado no navegador (Supabase local, dados reais): criação rápida e pelo formulário, arrastar (persiste
após recarregar), mover pelo menu, concluir, painel (título, prioridade, vínculo, descrição, checklist —
persistem), indicador → filtro na URL, lista (status na linha, seleção, prioridade em lote, exclusão em lote
com confirmação), colunas (criar, renomear, cor, mover, recolher, excluir com destino — a tarefa foi para a
coluna escolhida), calendário (+ com data), atalhos (C, /, 1/2/3, Esc, J, Enter; digitar no formulário não
dispara atalho), Minhas × Escritório; 390, 768, 1024, 1280, 1440, 1680 px sem rolagem horizontal da página;
leitor (`tasks.view`) sem nenhuma ação de edição na tela e barrado no banco (editar, concluir, excluir, criar
tarefa ou coluna); outro escritório sem leitura nem escrita de tarefas, colunas ou atividades. Os dados de
teste foram removidos.

## Páginas (Tarefas › Páginas)

Espaço de anotações no estilo Notion dentro de Tarefas, com as tarefas reais dentro das páginas.
Rotas `/tarefas/paginas` (início) e `/tarefas/paginas/[id]`; item "Páginas" no menu, sob Tarefas, e
botão no cabeçalho de Tarefas.

- **Banco (`0027_paginas.sql`, aditiva):** `pages` (título, conteúdo em JSON do editor, pessoal ou do
  escritório, subpáginas, vínculo com cliente/processo, modelo de origem, autor, quem editou, versão) e
  `page_favorites`. O gatilho define autor, versão (sobe só quando título/conteúdo mudam), texto de busca
  e as tarefas referenciadas (`task_ids`); impede ciclo, subpágina herda o acesso e uma árvore com páginas
  de outras pessoas não vira pessoal. RLS: pessoal só o autor; do escritório lê com `tasks.view`, altera
  com `tasks.edit`; vinculada a cliente/processo só para quem também o vê; outro escritório nunca.
  Teste em `supabase/tests/paginas.sql`.
- **Editor:** Tiptap 3.31.4 (ProseMirror, MIT), carregado só nas páginas. Texto, títulos, negrito,
  itálico, tachado, código, links (só http/https/e-mail/telefone), listas, checklist (passos — não são
  tarefas), citação, divisor, bloco de código; menu "/" e "@" (cliente, processo, tarefa, página); barra
  ao selecionar texto; alça do bloco (inserir, mover, duplicar, transformar, excluir) e Alt+Shift+↑/↓.
- **Tarefas na página:** "Nova tarefa" (formulário completo, nasce com `pageId`), "Tarefa existente",
  "Criar tarefa" com o texto selecionado e "Converter em tarefa" no passo do checklist. O bloco guarda só
  o id e mostra status, prazo, prioridade e responsável do registro real; concluir no bloco conclui a
  tarefa; o detalhe da tarefa mostra a página de origem e as páginas que a mostram.
- **Salvamento:** automático com espera de 0,9 s (máximo 5 s digitando), uma gravação por vez, condicionada
  à versão (conflito vira aviso com "Ver a versão salva" / "Manter a minha"); "Salvo" só após o banco;
  falha de rede mantém o conteúdo e tenta de novo (2 s → 30 s) com "Tentar agora"; aviso ao fechar a aba
  com algo pendente; sair da página grava o pendente; Ctrl/⌘+S grava na hora; ao voltar para a aba, a
  versão nova de outra pessoa é carregada se não houver nada pendente.
- **Navegação:** início (modelos, favoritas, editadas recentemente), coluna recolhível com busca no banco
  (título e texto, sem acento), favoritas, árvore Pessoais/Escritório e "+" para subpágina; gaveta no
  celular; trilha na página; mover página; excluir com confirmação (leva as subpáginas; tarefas ficam).
- **Modelos:** página em branco, reunião, planejamento semanal, projeto, análise interna de caso,
  procedimento, ideias — só estrutura, sem conteúdo jurídico pronto; ficam no código (a página guarda só
  de qual modelo veio).

Validado no navegador (Supabase local): criar pelo modelo, digitar, salvar e recuperar após recarregar;
"/" e "@"; nova tarefa, concluir pelo bloco, mudar prioridade no detalhe (o bloco acompanha), converter
passo em tarefa, tarefa existente; negrito; subpágina e trilha; favoritar; busca por texto do conteúdo
e sem resultado; falha de rede (indicador, conteúdo mantido, salvou ao voltar); conflito entre duas
sessões; aviso ao recarregar com conteúdo não salvo; mover bloco pelo teclado; 200 parágrafos (≈1,6 s para
salvar); excluir com subpágina; leitor sem edição e criando página pessoal; página pessoal e de outro
escritório inacessíveis pela URL e pela API; 390–1680 px sem rolagem horizontal.

