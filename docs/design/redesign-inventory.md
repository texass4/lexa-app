# Redesign da Íntegra — inventário de rotas e superfícies

Levantamento feito no código (branch `claude/keen-ride-8iewki`, commit `6b5dcfc`) e no app rodando com o
escritório de teste "Prado & Lima Advocacia" (Supabase local, dados fictícios). Capturas "antes" de cada
rota, em 1440×900 e 390×844, foram feitas fora do repositório.

Totais:
- **31 páginas** (`page.tsx`): 15 do escritório, 11 do Admin, 4 de autenticação e a raiz `/` (redireciona).
- **7 arquivos de layout/estado**: `layout.tsx` raiz, `(app)`, `(admin)`; `error.tsx`, `not-found.tsx` (app e raiz) e `template.tsx`.
- **67 rotas de API**: contratos preservados; o redesign não muda nenhuma.

Status: `não iniciada` · `em implementação` · `implementada` · `validada` (só depois de inspecionar o
resultado renderizado e rodar os testes pertinentes).

## Base técnica encontrada

| Item | O que existe |
|---|---|
| Framework | Next.js 16.3.8, App Router; grupos `(app)`, `(admin)`, `(auth)` |
| Estilo | Tailwind CSS 4 (`app/globals.css`, tokens em `@theme inline` + variáveis CSS), tema claro/escuro (`.dark`) |
| Componentes | Próprios em `components/ui/*` (26), sobre `@base-ui/react` + `shadcn` (`cva`), `cmdk` (busca), `sonner` (avisos), `framer-motion`, `recharts` |
| Ícones | `lucide-react` (único conjunto) |
| Tipografia | Geist / Geist Mono (`next/font/google`) |
| Marca | `components/brand/logo.tsx` (ativo oficial — reutilizar), `public/brand/*` |
| Dados | `lib/store/office-store.tsx` (Supabase + Realtime, carga mínima + sob demanda) e rotas `/api/*` |
| Permissões | `lib/auth/permissions.ts`; menu e guarda de rota em `components/layout/nav-config.ts` + `app-shell.tsx`; RLS no banco |
| Testes | `npm test` (768), `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:rls` (SQL), `npm run test:integration`; Playwright disponível só fora do repositório (Chromium em `/opt/pw-browsers`) |

## Inventário das páginas

Legenda de dados: **store** = `office-store` (Supabase com RLS, por escritório); **api** = rota `/api/*`.

| # | Página | Rota | Módulo | Layout atual | Componentes principais | Funcionalidades | Dados | Permissão | Problemas visuais encontrados | Melhorias planejadas | Dependências de backend | Critérios de aceitação | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Raiz | `/` | — | redireciona | — | → `/dashboard` | — | sessão (proxy) | — | — | nenhuma | redireciona sem flash | validada (sem UI) |
| 2 | Início | `/dashboard` | Painel | AppShell | `dashboard/*` (13): greeting, kpi-cards, insight-banner, attention-panel, week-prazos, today-agenda, open-tasks, finance-panel, recent-movements, recent-activity | saudação, KPIs, atenção, prazos da semana, agenda de hoje, tarefas, financeiro, movimentações, atividade | store | todos (blocos por permissão) | muitos blocos com o mesmo peso; agenda de hoje sem timeline visual nem avatares; página muito longa (2.600 px); banner "acompanha N processos" ocupa espaço nobre | hierarquia da referência: cabeçalho com data, 4 indicadores clicáveis, timeline da agenda com avatares e filtro por dia, tarefas com filtros rápidos, processos recentes em tabela compacta, visões rápidas, atividade | nenhuma nova (tudo já no store) | indicadores = dados reais; clique abre lista filtrada; timeline legível em 390 px | refinada e validada (timeline protagonista, indicadores compactos, dados auditados) |
| 3 | Processos | `/processos` | Processos | AppShell | `processes-view`, `data-table`, `filter-tabs`, `new-process-dialog` | lista paginada, busca CNJ/cliente, filtros por situação, novo processo, consulta | store (paginado) | `processes.view` | tabela densa sem ações por linha visíveis; filtros e busca em linhas separadas | barra de ferramentas única (busca + filtros + ação), linha com status, responsável (avatar), última movimentação, menu de ações | nenhuma | busca/filtros iguais; paginação preservada | ajustada e validada (E6) — sem reestruturação |
| 4 | Processo (detalhe) | `/processos/[id]` | Processos | AppShell | `process-profile`, `process-timeline`, `process-ai-panel`, `process-source-panel`, `process-jurisprudence`, prazos, tarefas, documentos | resumo, movimentações, prazos, tarefas, documentos, partes, andamento/consulta, jurisprudência, histórico, IA | store + api | `processes.view` (edição `processes.edit`) | página muito longa (3.100 px), duas colunas sem navegação interna; avisos "IA indisponível" repetidos; resumo jurídico espalhado | cabeçalho fixo com número, situação e ações; abas: Visão geral · Movimentações · Prazos e tarefas · Documentos · Jurisprudência · Histórico; aviso de IA único | nenhuma | todas as seções acessíveis; nada some; timeline com fonte e tipo | redesenhada e validada (E6: abas no desktop) |
| 5 | Consulta processual | `/processos/consulta` | Processos | AppShell | `consulta-view`, `start-consulta`, `enrichment-report` | consulta por CNJ (DataJud/DJEN), relatório, cadastrar/atualizar | api | `processes.view` | relatório longo; estados das fontes pouco destacados | etapas visíveis, relatório em seções com fonte por campo | nenhuma | estados ok/parcial/falhou/sigilo distintos | herda o novo sistema; validada sem regressão — redesenho específico pendente |
| 6 | Clientes | `/clientes` | Clientes | AppShell | `clients-view`, `new-client-dialog`, `import-clients-dialog` | lista, busca, filtros, novo, importar | store | `clients.view` | — (lista funcional, visual antigo) | CRM: avatar/iniciais, contato, processos, última atividade, ações | nenhuma | importação e duplicidade preservadas | redesenhada e validada (resumo clicável, filtros preservados) |
| 7 | Cliente (ficha) | `/clientes/[id]` | Clientes | AppShell | `profile/*` (client-header, hub-tabs, overview-tab, finance-tab, client-ai-dock) | ficha, abas, processos, documentos, financeiro, IA | store | `clients.view` | cabeçalho e abas já existem; espaçamentos inconsistentes | ficha CRM: cabeçalho com contatos, abas consistentes com o processo | nenhuma | abas e financeiro só com `finance.view` | ajustada e validada (contato sem esticar, atividade com o nome do processo) — sem reestruturação |
| 8 | Atendimento | `/atendimento` | Atendimento (WhatsApp) | AppShell altura total | `atendimento/*` (16) | inbox, conversa, composer, contexto, IA, conexão Meta | api + realtime | `whatsapp.view` | — (três painéis funcionais) | aplicar tokens e componentes; preservar layout de 3 colunas | nenhuma | envio e realtime preservados | herda o novo sistema (estado selecionado unificado); validada sem regressão — redesenho específico pendente |
| 9 | Tarefas | `/tarefas` | Tarefas | AppShell | `tasks-view`, `board-view` (Kanban), `task-card`, `task-row`, `task-detail-sheet`, `task-form-dialog` | lista e quadro, filtros, criar/editar/concluir, arrastar | store | `tasks.view` | lista e quadro com cartões diferentes | cartão único (título, responsável, prazo, prioridade, vínculo, atraso) nos dois modos | nenhuma | arrastar com alternativa por menu | redesenhada e validada (resumo clicável, barra única de exibição, escopo, filtros e busca) |
| 10 | Prazos | `/tarefas/prazos` | Tarefas | AppShell | `prazos-view`, `prazos-panel`, `new-prazo-dialog` | prazos processuais, cumprir/perder, novo | store | `processes.view` | — | lista por urgência com fonte (intimação/DJEN/manual) e situação | nenhuma | prazo ≠ tarefa ≠ evento | redesenhada e validada (lista com data fatal em destaque, ações compactas, períodos num painel) |
| 11 | Agenda | `/agenda` | Agenda | AppShell | `agenda-view`, `time-grid`, `month-grid`, `agenda-list`, `agenda-today`, `new-appointment-dialog`, `appointment-detail`, `category-picker` | dia/semana/mês, categorias, somente meus, criar/editar | store (por intervalo) | `agenda.view` | sem minicalendário; cabeçalho com resumo ocupa altura antes da grade | estrutura tipo Google Agenda: barra lateral com minicalendário + filtros, grade principal, criar no horário | nenhuma | visões Dia/Semana/Mês; celular em lista por dia | redesenhada e validada (E5) |
| 12 | Jurisprudência | `/jurisprudencia` | Jurisprudência | AppShell | `jurisprudence-view`, `result-row`, `decision-sheet`, `decision-ai`, `link-dialog` | busca, filtros, salvas, decisão, vincular, IA | api | `processes.view` | — | só visual (lógica e fonte preservadas — a base em `.db` não está neste ambiente) | nenhuma | referências continuam apontando para registros reais | herda o novo sistema; só o estado "base em preparação" pôde ser validado (base vazia neste ambiente) — pendente |
| 13 | Documentos (Central de Documentos) | `/documentos` | Documentos | AppShell | `documents-view`, `use-document-library`, `documents-nav`, `documents-toolbar`, `file-list`, `file-grid`, `file-thumb`, `document-actions`, `document-dialogs`, `document-details`, `document-viewer`, `selection-bar`, `new-document-dialog` (envio), `upload-tray` | navegação (Todos, Recentes, Favoritos, Clientes › processo, Categorias), trilha, busca no servidor, filtros combináveis (categoria, formato, cliente, processo, enviado por, período), ordem com direção, lista/grade com miniaturas reais, seleção múltipla (Shift), menu ⋯ e clique direito, detalhes, visualizador (pdf.js, imagem, texto), envio múltiplo com progresso real, renomear, mover, favoritar, baixar, copiar link (7 dias), excluir | store + Storage + `document_favorites` (0026) | `documents.view` (edição `documents.edit`; favoritos com `documents.view`) | — | gerenciador de arquivos no padrão Dropbox/Drive (2026-10) | **pastas criadas pela pessoa e lixeira não existem** (proposta abaixo); categorias são filtros, clientes/processos são vínculos reais | lugar e filtros na URL; nada sem persistência | redesenhada e validada no navegador (envio, visualizador, permissões, isolamento, 390–1680) |
| 14 | Financeiro | `/financeiro` | Financeiro | AppShell | `finance-view`, `revenue-chart`, `new-invoice-dialog`, `pay-invoice-dialog`, `finance-ai-panel` | cobranças, receber, gráfico, IA | store | `finance.view` | — | tokens, tabela e gráfico consistentes | nenhuma | valores idênticos | herda o novo sistema; validada sem regressão — redesenho específico pendente |
| 15 | Configurações | `/configuracoes` | Sistema | AppShell | `settings-view` + seções perfil, escritório, usuários, permissões, OAB, integrações | perfil, foto, OAB, acesso (e-mail/senha/sessões), aparência, equipe, permissões | store + api | todos (seções por permissão) | seção Acesso pede "Senha atual" duas vezes (trocar e-mail e trocar senha) — confuso | navegação lateral de seções, um formulário por tarefa, salvar por seção | nenhuma | nenhum campo perdido | Acesso corrigido; seções Perfil, Escritório, Usuários, Permissões e Integrações revisadas e validadas |
| 16 | Triagem (legado) | `/triagem` | — | redireciona | — | → `/processos` | — | — | — | — | nenhuma | — | validada (sem UI) |
| 17 | Não encontrada (app) | qualquer rota inexistente autenticada | Sistema | AppShell | `not-found.tsx` | mensagem + voltar | — | — | — | estado vazio no novo padrão | nenhuma | — | validada (painel da marca corrigido) |
| 18 | Erro (app) | erro de renderização | Sistema | AppShell | `error.tsx` | tentar de novo | — | — | — | estado de erro no novo padrão | nenhuma | — | estado de falha de conexão corrigido e validado ("Não foi possível conectar") |
| 19 | Sem acesso | rota sem permissão | Sistema | AppShell | `app-shell.tsx` (EmptyState) | explica e orienta | sessão | — | — | estado no novo padrão | nenhuma | nunca mostra o conteúdo | herda o novo sistema; não capturada — pendente |
| 20 | Entrar | `/login` | Autenticação | `auth-card` (duas colunas) | `login-form`, `use-auth-challenge` | login, prova anti-bot, link recuperar/cadastrar | Supabase Auth + api | público | — | tokens e tipografia novos; mesma estrutura | nenhuma | prova anti-bot e limites preservados | painel da marca corrigido (logo ilegível) e validada |
| 21 | Cadastro | `/cadastro` | Autenticação | auth-card | `signup-form` | criar escritório, verificação de e-mail | api | público | — | idem | nenhuma | idem | painel da marca corrigido e validada |
| 22 | Recuperar senha | `/recuperar-senha` | Autenticação | auth-card | `recover-form` | e-mail de recuperação | api | público | — | idem | nenhuma | sem enumeração de contas | painel da marca corrigido e validada |
| 23 | Redefinir senha | `/redefinir-senha` | Autenticação | auth-card | `reset-password-form` | nova senha | Supabase Auth | link de recuperação | — | idem | nenhuma | idem | mesmo componente (AuthCard); não capturada (exige link de redefinição) — pendente |
| 24 | Não encontrada (pública) | rota inexistente sem sessão | — | auth-card | `app/not-found.tsx` | voltar | — | público | — | idem | nenhuma | — | validada (painel da marca corrigido) |
| 25 | Admin · Painel | `/admin` | Admin (plataforma) | AdminShell (trilho escuro próprio) | `admin/dashboard` | métricas da plataforma | api (service role) | `super_admin` | a confirmar com captura (exige super admin local) | mesmos tokens e componentes do app | nenhuma | acesso só super admin | validada em 1440/390 (super admin só no ambiente local de teste) |
| 26 | Admin · Escritórios | `/admin/escritorios` | Admin | AdminShell | `organizations-view`, `new-office-form` | lista, criar escritório | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 27 | Admin · Escritório | `/admin/escritorios/[id]` | Admin | AdminShell | `organization-detail-view`, `organization-config`, `org-actions` | detalhe, plano, ações | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 28 | Admin · Usuários | `/admin/usuarios` | Admin | AdminShell | `users-view` | usuários da plataforma | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 29 | Admin · Planos | `/admin/planos` | Admin | AdminShell | `plans-view` | planos | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 30 | Admin · Financeiro | `/admin/financeiro` | Admin | AdminShell | `finance-view` (admin) | assinaturas, receita | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 31 | Admin · Uso | `/admin/uso` | Admin | AdminShell | `usage-view` | uso da plataforma | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 32 | Admin · Consumo de IA | `/admin/ia` | Admin | AdminShell | `ai-usage-view` | consumo de IA | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 33 | Admin · Monitoramento | `/admin/monitoramento` | Admin | AdminShell | `monitoring-view` | monitoramento de processos | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 34 | Admin · Atividade | `/admin/atividade` | Admin | AdminShell | `audit-view` | auditoria | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |
| 35 | Admin · Configurações | `/admin/configuracoes` | Admin | AdminShell | `settings-view` (admin) | parâmetros da plataforma | api | `super_admin` | idem | idem | nenhuma | idem | validada em 1440/390 (super admin só no ambiente local de teste) |

## Superfícies globais (aparecem em todas as rotas do app)

| Superfície | Arquivo | Função | Plano | Status |
|---|---|---|---|---|
| Barra lateral | `layout/sidebar.tsx`, `sidebar-nav.tsx`, `nav-config.ts` | menu por permissão, contadores, recolher (preferência salva no `ui-store`) | clara, como a referência: marca, itens com ícone, estado ativo em azul, seção **Atalhos** (processos/documentos recentes, tarefas de hoje, prazos próximos — links reais com filtro), Configurações e assinatura Digitaliza no rodapé; recolhível | implementada e validada |
| Barra superior | `layout/topbar.tsx`, `user-menu.tsx`, `notifications-menu.tsx`, `new-menu.tsx` | busca, perguntar à IA, notificações, perfil, "+ Novo" | busca ampla à esquerda; à direita notificações, ajuda, perfil (nome e papel); "+ Novo" preservado | implementada e validada |
| Busca global | `layout/command-menu.tsx` | Ctrl K, resultados por tipo | mesmo comportamento, visual novo, categorias visíveis | herda os tokens; validada sem regressão — redesenho específico pendente |
| Assistente (IA) | `ai/ai-chat-sheet.tsx`, `ai-dock.tsx`, `lexa-ai-provider.tsx`, `ai-context.ts` | conversa por escopo (processo, cliente, escritório, decisão), modos | painel lateral "Assistente Íntegra" com abas Conversa/Contexto, saudação, ações 2 × 2, "Sugestões para você", rodapé de confiança; **abre sozinho só no Início** quando cabe acoplado e a pessoa não o fechou antes | implementada e validada (acoplado quando sobram ≥ 760 px de conteúdo) |
| Navegação no celular | `layout/mobile-nav.tsx` | barra inferior + gaveta | mantida, com o visual novo | implementada (atalhos na gaveta) e validada em 390 px |
| Diálogos globais | `layout/global-dialogs.tsx` | novo processo/cliente/tarefa/compromisso | tokens novos | herdam os tokens — não revisados um a um (pendente) |
| Abertura | `layout/app-splash.tsx` | splash na primeira carga | tokens novos | herda os tokens — não revisada (pendente) |

## Componentes alterados na fidelidade à referência e páginas afetadas

Antes de cada mudança em componente compartilhado, os usos foram conferidos (busca pelos imports).

| Componente | Usado em | Efeito |
|---|---|---|
| `layout/app-shell.tsx` (margem do conteúdo) | todas as rotas internas | margem lateral de 24 px; validado sem rolagem horizontal em 8 rotas × 7 larguras |
| `layout/sidebar.tsx` (rodapé) | todas as rotas internas | texto "Tecnologia que impulsiona a advocacia" |
| `ai/ai-chat-sheet.tsx`, `ai/lexa-ai-provider.tsx`, `ai/ai-privacy.tsx` | assistente em todas as rotas | novo estado inicial (saudação, ações, sugestões, rodapé); abertura automática só no Início |
| `dashboard/chip-tabs.tsx` (variantes `solid` e `segmented`) | Início: agenda, tarefas, "O que mudou" | a variante padrão (`soft`) não mudou — "O que mudou" fica igual |
| `dashboard/panel-link.tsx` (não quebra linha) | cartões do Início | só o Início |
| `dashboard/dashboard-view`, `greeting`, `kpi-cards`, `today-agenda`, `open-tasks`, `recent-processes`, `quick-views` | só o Início (`/dashboard`) | composição e linguagem da referência |

## Painéis e diálogos que funcionam como etapas de navegação

`processos/movement-detail-sheet`, `tarefas/task-detail-sheet`, `agenda/appointment-detail`,
`jurisprudencia/decision-sheet`, `shared/document-preview-sheet`, `clientes/profile/edit-client-dialog`,
`processos/new-process-dialog`, `clientes/import-clients-dialog`, `prazos/new-prazo-dialog`,
`financeiro/new-invoice-dialog` e `pay-invoice-dialog`, `documentos/new-document-dialog` e
`edit-document-dialog`. Todos usam `ui/side-sheet` ou `ui/modal`: o redesign dos dois componentes cobre o
contêiner; o conteúdo de cada um é revisado junto da página de origem.

## Dependências de backend identificadas (não implementadas no redesign)

1. **Documentos — pastas criadas pela pessoa e lixeira:** o modelo `documents` organiza por categoria
   (tipo), cliente e processo — é isso que a Central navega (sem estrutura paralela). **Favoritos** foram
   implementados (migração aditiva `0026_documentos_favoritos.sql`, por pessoa, com RLS).
   - Pastas reais (proposta, não feita): tabela `document_folders (organization_id, id, parent_id, name)`
     com RLS do módulo, `data.folderId` opcional no documento, trigger que impede ciclo (o pai não pode ser
     descendente) e exclusão só de pasta vazia. Exige revisar contagens (`document_history_stats`) e as
     buscas do histórico.
   - Lixeira (proposta, não feita): `data.trashedAt` + exclusão definitiva agendada; todas as leituras
     (perfil do cliente/processo, IA, busca, contagens no banco) precisam ignorar os itens na lixeira.
     Hoje a exclusão é definitiva (registro e arquivo) e a confirmação diz isso.
   - Compartilhamento rastreado: não existe; o "Copiar link" gera URL assinada de 7 dias, sem registro.
2. **Atalhos "recentes" por pessoa:** não há registro de "aberto por mim". Os atalhos usam dados reais já
   existentes (atualizados recentemente, tarefas de hoje, prazos próximos).
3. **Ajuda:** não existe central de ajuda. O botão abre o atalho de teclado e o contato da Digitaliza, sem
   simular conteúdo.
4. **Arrastar eventos na agenda:** a atualização existe (`updateAppointment`); arrastar entra só se a
   validação de horário e permissão for reaproveitada sem nova regra.
5. **Admin:** capturas exigem um super admin local (`LEXA_SUPERADMIN_EMAIL`); sem isso, a validação visual
   das 11 telas fica pendente.
