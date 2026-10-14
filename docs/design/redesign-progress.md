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
| 6 | Processos, clientes, tarefas, prazos | parcial: detalhe do processo em abas; lista de processos ajustada; clientes, tarefas e prazos só herdam o sistema |
| 7 | Jurisprudência e IA (só visual) | parcial: herda tokens; base vazia neste ambiente impede validar resultados |
| 8 | Demais rotas (configurações, financeiro, atendimento, autenticação, admin, erros) | parcial: Configurações › Acesso e painel da autenticação corrigidos; Admin não capturável |
| 9 | Responsividade e polimento | parcial: 1440 e 390 em todas as rotas do app; 1024/1680 nas redesenhadas; 768 não varrido |
| 10 | Validação final e relatório de cobertura | executada (lint, typecheck, 768 testes, build, varredura de rotas) |

## Páginas

Auditadas: 35/35. Situação por rota: coluna "Status" do inventário.

- Redesenhadas e validadas (7): Início, Documentos, Agenda, Processo (detalhe), Entrar, Cadastro e
  Recuperar senha (painel da marca).
- Ajustadas e validadas sem reestruturação (1): Processos.
- Herdam o novo sistema, validadas sem regressão, redesenho específico pendente (9): Consulta processual,
  Clientes, Cliente, Atendimento, Tarefas, Prazos, Financeiro, Jurisprudência e Configurações (só a seção
  Acesso foi corrigida).
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
