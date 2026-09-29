# Íntegra — mapa do código

Guia para alterar o sistema sem adivinhar onde cada coisa mora. Alias `@/` aponta para a raiz de `lexa-app/`.

```
proxy.ts  (sessão Supabase em cookie; sem login → /login)
    ↓
SessionProvider (lib/auth/session.tsx) → lib/account.ts   (pessoa, escritório, membros)
    ↓
UI (página/componente)
    ↓  lê / age              ↓ permissões: useSession().can() · <Can>
useDemoData() · useDemoActions() · useUI()
    ↓
demo-store (+ storage.ts → Supabase; a RLS isola por escritório)   ui-store
    ↓  tipado por
types/index.ts

Consulta de processo (CNJ)
    ↓
lib/services/processes/client.ts          browser → API (JSON; só modelo interno e mensagem amigável)
    ↓
app/api/processes/search | [id]/sync      servidor → lookup-http.ts (autorização, erro público)
    ↓
lib/services/processes/lookup-service.ts  cache (memória → Supabase), stale-while-revalidate, deduplicação
    ↓
integrations/legal/datajud/provider.ts    ProcessProvider: client.ts (timeout, retry, 429) + mapper.ts
    ↓
sheet.ts → import.ts                       ficha normalizada → processo da Íntegra

Central de Atendimento (WhatsApp)
    tela → /api/whatsapp/* → lib/services/whatsapp → Z-API → WhatsApp
    WhatsApp → Z-API → /api/whatsapp/webhook → banco → Realtime → tela
```

---

## 1. Pastas

```
lexa-app/
├── app/                      rotas (páginas finas: metadata + view)
│   ├── (app)/                shell autenticado: dashboard, clientes, atendimento, processos,
│   │                         tarefas, agenda, documentos, financeiro, configuracoes
│   ├── (auth)/               login, cadastro, recuperar-senha, redefinir-senha
│   ├── (admin)/admin         painel do Super Admin (papel checado no servidor)
│   ├── auth/confirm          troca o token dos links (recuperação/convite) por sessão
│   └── api/                  processes/* (consulta), auth/* (cadastro, recuperação),
│                             team/users (gestão do escritório), me/email, admin/*,
│                             ai/* (Íntegra IA), whatsapp/* (Central de Atendimento + webhook da Z-API)
├── components/
│   ├── brand/                marca: símbolo, logotipo e composição (Logo, LogoMark, Wordmark)
│   ├── layout/               intro, sidebar, topbar, busca Ctrl K, notificações, modais globais
│   ├── ui/                   design system
│   ├── shared/               peças usadas em mais de um módulo
│   ├── processos/            lista, perfil, timeline, formulário com consulta CNJ
│   ├── ai/                   painéis, chat e blocos visuais da Íntegra IA
│   ├── atendimento/          Central de Atendimento (WhatsApp): conversas, conversa, contexto, Íntegra IA
│   └── clientes/ tasks/ agenda/ documentos/ financeiro/ dashboard/ configuracoes/
├── lib/
│   ├── cnj.ts                máscara, normalização e dígito verificador
│   ├── integrations/legal/   modelo neutro + ProcessProvider (types.ts), erros (errors.ts), DataJud (client, mapper, provider)
│   ├── integrations/whatsapp/ contrato neutro do provedor + Z-API (cliente HTTP, webhooks)
│   ├── services/processes/   serviço de consulta + cache, ficha, importação, deduplicação, interpretação
│   ├── ai/                   Íntegra IA: provedor (Gemini), contexto, prompts, schemas, serviços
│   ├── services/whatsapp/    recebimento, envio, conversas, instância, Íntegra IA (servidor)
│   ├── whatsapp/             telefone, status, mapeadores de linha, cliente do navegador
│   ├── auth/                 permissões, sessão, helpers de rota, gestão de membros
│   ├── supabase/             clientes: navegador, servidor (cookie) e admin (service role)
│   ├── store/                demo-store, ui-store, storage (persistência no Supabase)
│   ├── account.ts            pessoa e escritório logados (preenchido pela sessão)
│   ├── brand.ts              marca: nome, posicionamento e geometria do símbolo/logotipo
│   ├── config.ts             labels, cores de status e paleta das categorias
│   ├── selectors.ts          consultas derivadas (inclui o financeiro, calculado das faturas)
│   ├── dates.ts              `getNow()` + formatadores
│   └── format.ts             moeda, busca, normalização de texto, IDs
├── supabase/migrations/      SQL do banco: tabelas, RLS, Storage (rodar no SQL Editor)
├── proxy.ts                  sessão e bloqueio de rotas (o "middleware" do Next 16)
├── instrumentation.ts        cria o Super Admin no start do servidor
├── types/index.ts            contratos de todas as entidades
└── tests/                    loader que roda os testes .ts com `node --test`
```

Regra: **página não tem lógica**. `app/(app)/processos/page.tsx` só renderiza `ProcessesView`.

---

## 2. Rotas

| URL | Tela |
|---|---|
| `/dashboard` | `components/dashboard/dashboard-view.tsx` |
| `/clientes`, `/clientes/[id]` | `components/clientes/…` |
| `/atendimento` (`?c=<conversa>`) | `components/atendimento/atendimento-view.tsx` |
| `/processos`, `/processos/[id]` | `components/processos/processes-view.tsx`, `process-profile.tsx` |
| `/triagem` (`?id=<evento>`) | `components/triagem/triagem-view.tsx` (Triagem jurídica: DJEN, DataJud) |
| `/tarefas` · `/agenda` · `/documentos` · `/financeiro` · `/configuracoes` | `components/<módulo>/*-view.tsx` |
| `/configuracoes?secao=perfil` · `usuarios` · `permissoes` | `components/configuracoes/profile-section.tsx`, `members-manager.tsx`, `permissions-section.tsx` |
| `/login` · `/cadastro` · `/recuperar-senha` · `/redefinir-senha` | `components/auth/*-form.tsx` |
| `/admin` … | Íntegra Admin (Super Admin) — veja a seção 7 |

Menu lateral e título do header: `components/layout/nav-config.ts`. Barra inferior do mobile: `mobile-nav.tsx`.

---

## 3. Processos (dados reais)

Não há processos fictícios. Todo processo vem da consulta automática ou de cadastro manual.

**Regra de interface:** o usuário vê "Íntegra → processos → informações". Nome da fonte (DataJud), status HTTP, códigos internos, JSON e mensagens de erro técnicas **nunca** aparecem na tela — ficam nos logs do servidor (`[process-lookup] …`). Rótulos neutros em `lib/services/processes/labels.ts` (ex.: origem `datajud` → "Consulta automática").

**Consultar** — "Novo processo" → digitar o CNJ → **Preencher** (ou Enter):

1. `new-process-dialog.tsx`: se o processo já está salvo e foi atualizado há menos de 6 h, responde na hora, sem rede. Senão chama `lookupProcess` (`lib/services/processes/client.ts`) e mostra o esqueleto com mensagens progressivas (`process-lookup-status.tsx`).
2. `POST /api/processes/search` → `lookup-service.ts`, com stale-while-revalidate: cache fresco responde na hora; cache vencido responde na hora e atualiza em segundo plano (`after`).
3. A ficha é salva na hora (`importProcess`). Se o CNJ já existe, é atualizado (`applyProcessSync`), nunca duplicado.

**Abrir um processo** — `use-process-refresh.ts`: o que está salvo aparece imediatamente; se a última consulta não é de hoje (mesma regra do monitoramento, `monitoring-policy.ts › isCheckDue`), uma atualização roda em segundo plano ("Atualizando informações…"), sem bloquear a página. Continua mesmo se a pessoa sair da tela. Só movimentações novas entram (hash em `movements.ts`; a regra de mescla é `process-sync.ts › mergeProcessSheet`, a mesma do servidor).

**Atualizar** — botão no perfil → `POST /api/processes/[id]/sync` com `force` → vai à fonte (salvo se alguém do escritório acabou de fazer isso há menos de 1 min). Um processo cadastrado à mão com CNJ válido também pode ser atualizado e passa a ser acompanhado.

**Serviço de consulta** (`lib/services/processes/lookup-service.ts`, só servidor):

| | |
|---|---|
| Cache | memória do servidor (LRU, 500) → tabela `process_lookup_cache` no Supabase (migração 0005), **sempre por escritório** (RLS). Um cache global revelaria a um escritório quais processos outro acompanha. |
| Validade | 6 h fresco · até 7 dias servido enquanto atualiza · "não encontrado" 10 min, só em memória |
| Deduplicação | chamadas simultâneas (mesmo escritório + CNJ) compartilham uma ida à fonte; no navegador, `refreshProcess` também deduplica por processo |
| Rede (`datajud/client.ts`) | 35 s por tentativa, 60 s no total, até 3 tentativas com backoff + jitter; `Retry-After` nunca é antecipado (se passa de 8 s, desiste e devolve `retryAfterMs` no `LookupError`); 401/403 e 4xx não se repetem |
| Erros | `LookupError` (código + detalhe) → log; `publicLookupError` → `invalid` · `not_found` · `unsupported` · `unavailable` + mensagem amigável |

Trocar de fornecedor: implementar `ProcessProvider` (`lib/integrations/legal/types.ts`) e trocar em `process-lookup.ts`. Interface, cache e rotas não mudam.

**Timeline** — movimentação bruta → `ProcessMovement` (fatos da fonte + `raw`, guardado mas não exibido) → `movement-interpreter.ts` (categoria, título, descrição legível) → `movement-timeline.ts` (dias e agrupamento visual) → `process-timeline.tsx` + `movement-detail-sheet.tsx`.

Detalhes da fonte que valem lembrar:
- Em `complementosTabelados`, `descricao` é a chave técnica (`tipo_de_documento`) e `nome` é o texto legível (`Certidão`).
- Sob carga, a fonte responde **200 com shards falhos e sem resultados**. O cliente trata isso como falha temporária e tenta de novo — não como "não encontrado".

Variáveis de ambiente (só servidor): `DATAJUD_API_KEY`; opcionais `PROCESS_LOOKUP_TIMEOUT_MS` e `DATAJUD_BASE_URL`.

### Monitoramento automático

Um processo que ninguém abriu continua sendo atualizado. O agendador da hospedagem chama `GET /api/cron/process-sync` (sugestão: a cada hora) com `Authorization: Bearer <CRON_SECRET>`; sem o segredo configurado, a rota não roda (`/api/cron/` é pública no `proxy.ts` porque se autentica sozinha).

```
agendador → /api/cron/process-sync → monitor.ts (runProcessMonitor)
  → claim_process_monitoring (banco escolhe e reserva os elegíveis)
  → lookup-service (cache do escritório → fonte; o mesmo das rotas)
  → mergeProcessSheet → gravação condicionada à versão (updated_at)
  → atividade "N novas movimentações no processo X" (autora: Íntegra) só se houver novidade
  → process_monitoring (próxima consulta) + process_sync_runs (execução)
  → Realtime entrega processo e atividade a quem está com a Íntegra aberta
```

| | |
|---|---|
| Elegível | escritório ativo, processo não concluído, acompanhado (`source.provider = datajud`), CNJ de 20 dígitos, `next_check_at` vencido — os nunca consultados e os mais antigos primeiro. Duas execuções simultâneas nunca pegam o mesmo processo (reserva de 15 min) |
| Política (`monitoring-policy.ts`) | sucesso: próxima só no dia seguinte (fuso `America/Sao_Paulo`) e nunca antes de 12 h · falha passageira: 30 min × 2ⁿ até 24 h, nunca antes do `Retry-After` · não encontrado: 3 dias · tribunal sem consulta: 30 dias |
| Parar a execução | 429 (pausa todas as execuções até o `Retry-After`, mínimo 15 min) · 3 indisponibilidades seguidas (10 min) · chave recusada (1 h). Qualquer outra falha fica só no processo e o lote segue |
| Ritmo | lote de 20, 2 consultas por vez, 1 s de pausa entre idas à fonte, sem começar consultas depois de 120 s (`PROCESS_SYNC_*`, com limites) |
| Cache | o do `lookup-service`; o worker aceita qualquer consulta do mesmo dia (de qualquer pessoa do escritório) sem ir à fonte |
| Datas | `lastSyncedAt` = última consulta (qualquer caminho); `autoSyncedAt` = última sincronização do monitoramento — "Atualizado automaticamente em DD/MM às HH:MM" no perfil. Gravadas no horário do escritório (`toLocalISOIn`), não do servidor |
| Isolamento | service role (sem sessão), então todo acesso em `monitor-store.ts` filtra por `organization_id`; o cache continua por escritório |

Estado: `monitor-status.ts` — "Ativo" só com consulta ligada, `CRON_SECRET`, `DATAJUD_API_KEY`, migração 0009 e uma execução concluída nas últimas 26 h. Admin › Monitoramento mostra estado, fila e as execuções (avaliados, consultados, do cache, novidades, erros, 429, 503, duração); Configurações › Integrações mostra o cartão "Monitoramento processual" com o estado real.

### Triagem jurídica (`/triagem`)

Uma caixa única com os eventos que podem exigir ação do escritório: `evento → interpretação → atenção → decisão → ação`. Não é uma caixa de notificações: só entra o que pode pedir providência, e cada evento tem estado persistido.

```
DJEN (intimações por OAB) ─┐
DataJud (movimentações)   ├→ save_triage_items → triage_items → Íntegra IA (uma vez) → Triagem (tempo real)
próximas fontes           ─┘                                         → advogado decide → Prazo (Etapa 4) + tarefa
```

| | |
|---|---|
| Modelo único | `triage_items` (`0012_triagem.sql`) + `lib/triagem/model.ts`. Toda fonte grava pelo mesmo caminho (`save_triage_items`): tipo (`intimacao`, `movimentacao`), origem (`djen`, `datajud`), chave na fonte (nunca duplica), data, processo, responsável, trecho do original. Nova fonte = nova função em `lib/triagem/sources.ts`, sem regra de triagem própria |
| Estados | `pendente`, `em_revisao`, `decidido` (`prazo_criado` ou `sem_prazo`), `ignorado` — no banco. Quem decidiu e quando: o banco grava a pessoa logada (não dá para informar outra). Decidido com prazo não reabre; sem prazo e ignorado, sim |
| Abas | A revisar (pendente com processo) · Sem processo · Revisar (em revisão) · Decididos. "Somente minhas" = responsável. Ordem: urgência (prazo sugerido em até 5 dias), exige ação, prazo, data |
| DJEN | `lib/services/intimacoes/capture.ts`, no agendador da Etapa 5: OABs ativas, uma consulta por número+UF (mesmo em dois escritórios), janela com 1 dia de sobra, retry/backoff, 429 para a execução, falha de uma OAB não para as outras. `intimacoes` guarda a comunicação como veio (teor original, imutável); `save_intimacoes` cria o evento na mesma transação |
| DataJud | `monitor.ts` (Etapa 5): das movimentações novas, as que pedem atenção (julgamento, audiência, prazo, citação, trânsito em julgado; não "conclusos", "mero expediente", juntadas) e dos últimos 30 dias entram como evento, no máximo 10 por processo |
| Vínculo | pelo CNJ, só com UM processo do escritório com o número. Nenhum → "Sem processo" (cadastrar e vincular pela própria tela). Mais de um → revisão. Processo cadastrado depois → `relink_triage_items` na execução seguinte. Nada é criado sozinho |
| Íntegra IA | `lib/triagem/interpret.ts` + `lib/services/triagem/interpret.ts`, no agendador, depois da captura, com o modelo leve, 30 s por evento e a mesma medição/limite do plano (escritório sem cota espera o mês virar, sem gastar tentativa): resumo em uma frase, "exige ação?" e o prazo **copiado** do teor. O trecho citado precisa existir no original e trazer o número — senão é descartado. A data nunca vem da IA (é calculada pelas regras). Divergência ou dúvida → `em_revisao` com o motivo. Guardado em `triage_items.ai`, gerado uma vez; abrir a tela não chama o modelo. Falhou: o evento continua com o original; nova tentativa em 15 min, 1 h, 4 h |
| Prazo | `lib/intimacoes/deadline.ts`: publicação = 1º dia útil após a disponibilização (Lei 11.419/2006, art. 4º, §3º); contagem a partir do dia útil seguinte (§4º; CPC 224, §3º); dias úteis (CPC 219), recesso de 20/12 a 20/01 (CPC 220), feriados nacionais (+ Lei 5.010/66 na Justiça Federal). Horas, mais de um prazo, "prazo legal", prazo em dobro, matéria penal ou nenhum prazo → revisão, sem data. Confirmar cria o Prazo da Etapa 4 (origem `intimacao` ou `movimentacao`, `triageItemId` único no banco) e a tarefa; rejeitar não cria nada |
| Timeline | vincular uma intimação registra UMA atividade no processo (id determinístico). Movimentações já estão na timeline. O perfil do processo tem o painel "Triagem" com tipo, origem, data, resumo e responsável |
| Auditoria | `triage_events`, só por gatilho: registrou, visualizou (uma vez por pessoa), vinculou, atribuiu, marcou revisão, confirmou prazo, decidiu sem prazo, ignorou, reabriu, interpretou |
| Isolamento | RLS: ver com `processes.view`, decidir com `processes.edit`; origem, sugestão e interpretação só o servidor grava (`triage_items_guard`). `djen_oab_state` e as funções de captura/IA só service role |
| Ritmo | DJEN: 30 OABs por execução, 1 s entre consultas, sem consultas novas depois de 90 s (`DJEN_*`). IA: até 15 eventos por execução, sem pedidos novos depois de 240 s da chamada |

A fonte do DJEN é a API pública de Comunicações Processuais do CNJ (`comunicaapi.pje.jus.br`): gratuita, sem chave, limite por IP (429 → 60 s), bloqueio fora do Brasil e teto de 10 mil resultados. A captura fica desligada (`features.djen`) até o escritório confirmar os termos de uso com o CNJ e hospedar a função no Brasil. Admin › Monitoramento tem a aba "Intimações (DJEN)".

---

## 4. Store, persistência e dados

```ts
const data = useDemoData()          // clients, processes, tasks, taskColumns, appointments…, hydrated
const { addTask, importProcess } = useDemoActions()
```

- **Os dados moram no Supabase** — o store é só a cópia local. Cada coleção é uma tabela (`organization_id`, `id`, `data jsonb`, `updated_at`). `lib/store/storage.ts` carrega o que a RLS deixa a pessoa ver e grava só o que mudou (`diffState`, comparando por identidade — o store é imutável). A gravação é agrupada (300 ms) e em fila; se o banco recusar (sem permissão, falha), aparece um aviso e a tela recarrega o que está salvo.
- **Equipe ao mesmo tempo** (`lib/store/office-sync.ts`, a única camada que grava, assina o Realtime e revalida):
  - *Tempo real*: um canal por escritório, INSERT/UPDATE/DELETE das 10 coleções, sempre com filtro `organization_id=eq.…` (sem ele, o Realtime entrega exclusões de qualquer escritório). Tudo é aplicado por id: o eco da própria gravação não duplica.
  - *Versão*: `updated_at` muda a cada gravação (`bump_row_version`, migração `0006`). Alterar/excluir é `update … where id = … and updated_at = <versão conhecida>` — atômico no banco. Nenhuma linha afetada = outra pessoa gravou antes: a gravação é recusada, aparece "Este registro foi alterado por outra pessoa." e só aquele registro é recarregado.
  - *Formulários de edição* guardam `versionOf(coleção, id)` ao abrir e passam `{ baseVersion }` para a ação (`updateTask`, `updateClient`, `updateProcess`, renomear coluna/categoria), que devolve `SaveResult` (`saved`/`conflict`/`removed`/`error`) depois que o banco confirma. Em `conflict`, o formulário mostra o registro atual.
  - *Revalidação*: ao (re)conectar o Realtime e ao voltar à aba depois de 3 min (`REVALIDATE_AFTER_HIDDEN_MS`), baixa só id + versão e busca apenas o que mudou.
  - *Código do processo* (`#103000`…): gerado pelo banco no INSERT (contador por escritório, migração `0007`); `addProcess`/`importProcess` esperam o banco para ter o código. Único por escritório.
  - Teste com Supabase real: `npm run test:integration` (ver o cabeçalho de `tests/integration/office-sync.integration.ts`).
- **Prazos** (`types/index.ts › Prazo`, tabela `deadlines`, migração `0008`): a única fonte de prazos — `Process.nextDeadline` não existe mais. Próximo prazo = o aberto de menor data fatal (`lib/prazos.ts › nextPrazo`). Vínculos (processo, cliente, responsável, tarefa, quem criou) são colunas com chave estrangeira derivadas de `data` pelo banco; o cliente acompanha o do processo. Criar prazo (`addPrazo`) cria junto a tarefa vinculada por id (data interna, responsável do prazo); cumprir/perder (`setPrazoStatus`) registra atividade `deadline` nas timelines do processo e do cliente. Alertas em `lib/attention.ts` (5 dias, 2 dias, hoje, vencido e "Prazo sem tarefa").
- `hydrated` fica `true` quando os dados do escritório terminam de carregar. As telas mostram esqueleto só até lá.
- A carga começa junto com a sessão (`preloadOfficeData`), não depois dela: a RLS já decide o que volta.
- Arquivos de documentos ficam no Storage (`documents/<organization_id>/…`); a pré-visualização usa URL assinada de 5 min (`lib/documents.ts`).
- Horário: sempre `getNow()` (`lib/dates.ts`), nunca `new Date()` espalhado pela UI.
- Pessoa e escritório logados: `currentUserId()`, `currentOrgId()`, `getUser(id)`, `getMembers()` (`lib/account.ts`), preenchidos pelo `SessionProvider`. Dentro de componentes, prefira `useSession()`.

Novo campo num cadastro: tipo em `types/index.ts` → formulário → ação no store → exibição (o jsonb não precisa de migração).
Nova coleção: tipo → `PersistedState` + `TABLES` em `storage.ts` → tabela e políticas na migração.
Nova ação de negócio: método em `DemoActions` + implementação, registrando uma `Activity` quando fizer sentido.

### Categorias de compromisso

Remarcar: arrastar o compromisso na semana/dia (encaixa em 15 min, mantém a duração) ou para outro dia no mês; "Editar" no detalhe abre o mesmo formulário do cadastro. A timeline registra "Fulana remarcou o compromisso de 10/10 14:00 para 11/10 15:00." e o aviso oferece desfazer.

Não há tipos fixos: cada escritório cria as suas categorias (nome + cor da paleta `CATEGORY_COLORS` em `lib/config.ts`) direto no formulário do compromisso — `components/agenda/category-picker.tsx`. Excluir uma categoria deixa os compromissos dela "Sem categoria". Para colorir um compromisso em qualquer tela, use `useCategoryLookup()` (`components/agenda/use-category.ts`) + `categoryStyle(color)`.

---

## 4b. Central de Atendimento (WhatsApp via Z-API)

**Tela** — `/atendimento`, três áreas: conversas (`conversation-list.tsx`) → conversa (`conversation-view.tsx`: cabeçalho com ações rápidas, busca, `message-list.tsx`, `composer.tsx`) → contexto jurídico (`context-panel.tsx`) com a aba Íntegra IA (`ai-panel.tsx`). Abaixo de 1280 px o contexto abre como painel lateral; no celular, lista e conversa se alternam. O `AppShell` dá altura total a essa rota.

**Dados** — tabelas próprias (não o padrão jsonb), em `supabase/migrations/0002_whatsapp.sql`:

| Tabela | O quê |
|---|---|
| `whatsapp_instances` | conexão com a Z-API (sem token) e status |
| `whatsapp_contacts` | telefone do contato; `client_id` quando vinculado a um cliente |
| `whatsapp_conversations` | uma por contato e instância; status, responsável, não lidas, prévia |
| `whatsapp_messages` | recebidas, enviadas, notas internas (`note`) e registros (`event`) |
| `whatsapp_message_attachments` | mídias; arquivo no bucket `whatsapp` (`<org>/…`) |
| `whatsapp_tags`, `whatsapp_conversation_tags` | tags do escritório |
| `whatsapp_conversation_assignments` | histórico de responsáveis |
| `whatsapp_statuses` | status personalizados (futuro), cada um ligado a uma categoria do sistema |
| `whatsapp_webhook_events` | log bruto dos webhooks (só o servidor vê) |

Isolamento: RLS de leitura (`current_org_id()` + `whatsapp.view`) e **chaves estrangeiras compostas** `(organization_id, id)` — o banco recusa qualquer referência entre escritórios. O navegador só lê; toda escrita passa por `/api/whatsapp/*` (`requireActor` → serviço → service role). A tela recebe mudanças pelo Realtime do Supabase (`inbox-provider.tsx`), que respeita a mesma RLS.

**Envio** — `POST /api/whatsapp/conversations/:id/messages` (`services/whatsapp/outbound.ts`): grava `pending`, chama a Z-API e vira `sent`/`failed`; entregue/lida chegam pelo webhook e só avançam (`whatsapp_apply_status`). Anexos: o navegador sobe em `whatsapp/<org>/outgoing/…` e a Z-API recebe um link assinado de 1 h. **Notas internas** são gravadas e param ali — o banco impede que uma nota tenha id do WhatsApp.

**Recebimento** — a Z-API chama `POST /api/whatsapp/webhook?token=<ZAPI_WEBHOOK_SECRET>` (rota pública no `proxy.ts`). O segredo é comparado em tempo constante e o `instanceId` do corpo define o escritório. `parseZapiWebhook` traduz o evento; `services/whatsapp/inbound.ts` identifica o contato pelo telefone, **vincula sozinho ao cliente de mesmo telefone** (com e sem o nono dígito — `lib/whatsapp/phone.ts`), cria a conversa e grava a mensagem (idempotente). Sem cliente, fica "Contato novo": transformar em cliente é sempre uma ação confirmada na tela. Mídias recebidas são copiadas para o Storage depois da resposta (`after`), porque os links da Z-API expiram.

**Instância** — a do `.env` pertence ao escritório de `ZAPI_ORGANIZATION_ID` (criada sozinha no primeiro uso). Credenciais nunca vão ao banco nem ao navegador; `providerFor()` (`services/whatsapp/instances.ts`) é o ponto a estender para vários números. Quem tem `office.manage` vê na Central o diagnóstico, o QR Code e o botão que cadastra os webhooks na Z-API.

**Permissões** — `whatsapp.view` (ler), `whatsapp.edit` (responder, notas, tags, status, assumir conversa sem responsável), `whatsapp.assign` (distribuir e trocar responsável). Padrões por papel em `role_defaults` (0002) e `lib/auth/permissions.ts`.

**Íntegra IA** — `POST /api/whatsapp/ai` (`services/whatsapp/ai.ts`, Claude via `@anthropic-ai/sdk`, saída estruturada com zod). Resume, sugere resposta, identifica tarefas e processos, analisa imagens/PDFs recebidos e escreve resumo interno. **Nunca executa nada**: a resposta sugerida vai para o campo (só sai com "Enviar") e criar tarefa / salvar nota pedem confirmação.

Variáveis: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `ZAPI_ORGANIZATION_ID`, `ZAPI_WEBHOOK_SECRET`, opcionais `ZAPI_WEBHOOK_BASE_URL` e `ANTHROPIC_API_KEY` (veja `.env.example`).

---

### Clientes (hub do cliente)

O cliente é a entidade central: processos (`clientId`), tarefas (`related`), documentos, compromissos e faturas apontam para ele — e o que aponta só para um processo dele também é dele. `clientHub()` e `clientFinance()` (`lib/selectors.ts`) reúnem tudo; o perfil (`components/clientes/profile/`) tem abas Visão geral, Processos, Tarefas, Documentos, Compromissos, Financeiro e Timeline, cada uma exigindo a permissão `.view` do módulo.

- Regras do cadastro (CPF/CNPJ com dígito verificador, duplicidade, telefone, endereço, tags, WhatsApp): `lib/clients.ts`. O formulário único de criar/editar é `components/clientes/client-form.tsx`. O banco repete a checagem do documento (`0004_clients_hub.sql`); a violação volta como aviso próprio (`SyncResult.conflicts`).
- Fatura "a vencer" com vencimento passado conta como atrasada: use `invoiceStatus()`, nunca `invoice.status` direto.
- Lançamentos financeiros: diálogo global `"invoice"` (`components/financeiro/new-invoice-dialog.tsx`), gravando em `invoices` — o mesmo dado do módulo Financeiro.
- `updateClient` registra na timeline mudança de status, de responsável e de dados; atividades de tarefa, documento e compromisso vinculados a processo levam o `clientId` do processo.
- WhatsApp: link oficial (wa.me) no cadastro; a conversa em si fica na Central de Atendimento (seção 4b).
- **Contato** (status `contato`): pessoa sem CPF/CNPJ — criada no formulário, pela importação ou em "Transformar em cliente" na Central. O documento, quando informado, continua validado e único. `resolveClientStatus` mantém o status coerente (sem documento: Contato ou Inativo; ao ganhar documento, Novo). Para vincular processo, anexar contrato ou lançar honorários, o CPF/CNPJ é exigido (`documentRequiredIssue`) — e o banco repete a regra (`0010_contacts.sql`, só em vínculos novos ou alterados), além de impedir que um cliente com processo, fatura ou contrato perca o documento.
- **Importação por planilha** (Clientes › Importar): `lib/csv.ts › parseCSV/decodeCSV` (`;`/`,`/tab, aspas, Windows-1252) → `lib/client-import.ts` (colunas pelo cabeçalho, mesmas validações do cadastro, duplicados por CPF/CNPJ — ou e-mail/telefone quando falta documento —, contra o escritório e dentro do arquivo) → prévia → confirmação → `importClients` (lotes de 100 pela sessão de quem importa, com a RLS de sempre; lote recusado é refeito um a um para apontar a linha) → relatório (importados, duplicados, inválidos, falhas e motivo; baixável em CSV).
- Edição com conferência de versão (`SaveOptions.baseVersion`) em compromissos (`updateAppointment`), lançamentos (`updateInvoice`, inclusive a baixa pela lista do Financeiro) e documentos (`updateDocument`: nome — a extensão é mantida —, tipo, cliente e processo). Cada edição registra quem fez e o que mudou (`lib/agenda.ts`, `lib/invoices.ts`).

## 5. UI global

`app/layout.tsx` → `Providers` (tema, stores, toasts) → `app/(app)/layout.tsx` → `SplashGate` (intro) → `AppShell` (sidebar, topbar, busca, modais).

**Intro** (`components/layout/app-splash.tsx`) — cobre a tela só enquanto o app inicializa de verdade: sai quando os dados do escritório carregam (ou 1,2 s depois da sessão pronta, deixando os esqueletos assumirem). Animação em CSS (`globals.css`, `.brand-splash-*`), então roda antes da hidratação e não pisca. Sem tempo mínimo artificial; navegar entre páginas não a mostra de novo.

**Carregamento sob demanda** — os diálogos globais (`global-dialogs.tsx`) e o gráfico do painel (recharts) saem do pacote inicial; os diálogos são baixados quando o navegador fica ocioso.

```ts
const { openDialog } = useUI()
openDialog("task", { processId })   // "client" | "task" | "appointment" | "document" | "process" | "invoice"
```

Design system — reutilize, não invente: `page-header`, `panel`, `button`, `status-badge`, `filter-tabs`, `underline-tabs`, `search-field`, `data-table`, `empty-state`, `skeleton`, `modal`, `side-sheet`, `field`, `user-avatar`, `motion` (`FadeIn`). Classes com `cn()` (`import { cn } from "cn"`). Tokens de cor em `app/globals.css`.

## 5b. Marca Íntegra

**Posicionamento** — *Íntegra — Inteligência para a gestão jurídica.* Institucional, sóbria e atemporal; a IA é parte do produto, não a identidade inteira.

**Símbolo** — um "I" estrutural (viga em I: solidez, estrutura, organização) com o acento agudo do "Í" como um bloco inclinado em azul — a camada de inteligência apoiada na estrutura. Grade de 32 × 32, cantos de 7,5. Funciona sozinho como ícone (favicon a partir de 16 px).

**Logotipo** — "Íntegra" em Geist SemiBold convertida em curvas (licença OFL), com o acento redesenhado no mesmo ângulo do símbolo. Composição horizontal: símbolo + nome, com a altura das maiúsculas ≈ metade do símbolo.

**Onde está** — tudo sai de `lib/brand.ts` (nome, posicionamento, `AI_NAME`, geometria). Na interface, use `components/brand/logo.tsx`: `<Logo />` (símbolo + nome; `collapsed`, `subtitle`, `size="sm|md|lg"`, `tone="inverse"` para superfícies sempre escuras), `<LogoMark />` e `<Wordmark />`. Não redesenhe a marca em outros arquivos. Arquivos estáticos em `public/brand/` (`integra-logo`, `integra-symbol`, `integra-wordmark`, cada um com versão `-inverse` para fundos escuros, e os PNG do manifest); `app/icon.svg`, `app/favicon.ico` e `app/apple-icon.png` são o ícone do navegador; `app/manifest.ts` é o manifest do app.

**Cores** — tokens em `app/globals.css`, claro e escuro:

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `primary` / `navy` | `#0F2446` | `#E6EAF0` | botões principais, cor institucional |
| `brand` | `#2B57C4` | `#7FA3F5` | destaque: foco, seleção, item ativo, realces |
| `brand-strong` | `#1F449E` | `#A9C2FA` | texto sobre `brand-soft` |
| `brand-soft` | `#EEF3FD` | `#152241` | fundos de destaque |
| `background` / `surface` | `#F6F7F9` / `#FFFFFF` | `#0A0F18` / `#111723` | superfícies |
| `foreground` / `muted-foreground` | `#0E1726` / `#5F6B7D` | `#E6EAF0` / `#95A0B3` | texto |
| `success` `warning` `danger` `info` `violet` | discretas | discretas | semânticas |
| `--logo-*` | marinho | claro | cores da marca (trocam sozinhas no tema escuro) |

A barra do Admin usa `admin-rail` (marinho) e `admin-rail-highlight` para o item ativo. Os tons de status usam `tone="brand"` (antes `gold`).

**Tipografia** — Geist em toda a interface; títulos de página em `font-display` (Geist semibold, entrelinha e espaçamento negativos). A antiga DM Serif Display saiu.

### O que merece atenção (sem IA)

`lib/attention.ts` transforma os dados em sinais — prazo vencendo, tarefa atrasada, movimentação recente (as de prazo/julgamento/comunicação/audiência pedem revisão), processo parado há mais de `STALE_DAYS` (60) **e sem consulta à fonte nos últimos 7 dias** — consultado há pouco, a falta de movimentação está confirmada e o processo não é tratado como esquecido; o alerta mostra as duas datas, valor em atraso, documento novo. Cada sinal tem nível (`critical` · `warning` · `info` · `done`), frase, link para o registro real e, quando faz sentido, ação ("Criar tarefa" abre o formulário preenchido). Respeita as permissões de quem olha e agrupa sinais repetidos. Usado no Painel (`attention-panel.tsx`), nos perfis de Processo e Cliente, na lista de processos, no sino, na busca Ctrl K e nos badges do menu. Testes: `lib/attention.test.ts`.

"Desde sua última visita" (`changesSince` + `lib/visits.ts`): a última presença fica no `localStorage` do navegador, por pessoa; o painel mostra o que outras pessoas registraram e as tarefas que venceram desde então.

Transições: `app/(app)/template.tsx` (entrada de página em CSS, `.page-enter`) e `MotionConfig reducedMotion="user"` em `Providers` — com "reduzir movimento" no sistema, nada anima.

---

## 6. Contas, escritórios e permissões

**Isolamento** — garantido no banco, não na tela. Toda tabela de dados tem RLS: só linhas com `organization_id = current_org_id()`, e `current_org_id()` só devolve o escritório se o perfil **e** o escritório estiverem ativos. Cada módulo exige sua permissão (`has_perm('clients.view')` para ler, `.edit` para gravar). Papel, permissões, status e e-mail só mudam pelas rotas do servidor (service role), depois de `requireMember`/`requireSuperAdmin` (`lib/auth/server.ts`).

**Papéis** — Super Admin (sem escritório; vem do `.env.local`), Sócio/Proprietário (tudo), Advogado, Colaborador/Estagiário. Padrões em `lib/auth/permissions.ts` **e** em `role_defaults` na migração — o teste `permissions.test.ts` falha se divergirem. O Sócio pode personalizar as permissões de cada pessoa (Configurações › Usuários › Permissões).

**Na interface** — `useSession().can("x.edit")` ou `<Can permission="x.edit">` para esconder ações; `nav-config.ts` diz a permissão de cada rota (menu, busca e "sem acesso" no `AppShell`); `DIALOG_PERMISSION` (`ui-store.tsx`) diz a de cada diálogo global.

**Fluxos** — cadastro público cria escritório `pending` (Super Admin aprova em `/admin`). Convite e recuperação geram link de uso único; enquanto não há provedor de e-mail, o link sai no terminal (`lib/auth/mailer.ts`).

## 7. Íntegra Admin (`/admin`)

Centro de controle do Super Admin, com shell próprio (barra lateral escura, busca `Ctrl K`, pendências, perfil, botão para o CRM).

| URL | Tela | API |
|---|---|---|
| `/admin` | `components/admin/dashboard/dashboard-view.tsx` | `GET /api/admin/overview?from&to` |
| `/admin/escritorios`, `/[id]` | `components/admin/organizations/*` | `/api/admin/organizations[/id[/users…]]` |
| `/admin/usuarios` | `components/admin/users/users-view.tsx` | `GET /api/admin/users`, `PATCH /api/admin/users/[id]` (mover) |
| `/admin/planos` | `components/admin/plans/plans-view.tsx` | `/api/admin/plans[/id]` |
| `/admin/uso` | `components/admin/usage/usage-view.tsx` | `GET /api/admin/organizations` |
| `/admin/ia` | `components/admin/usage/ai-usage-view.tsx` | `GET /api/admin/ai-usage?from&to` (consumo de IA por escritório: chamadas, cache, tokens, custo, operações, modelos, erros) |
| `/admin/financeiro` | `components/admin/finance/finance-view.tsx` | `GET /api/admin/finance` |
| `/admin/atividade` | `components/admin/audit/audit-view.tsx` | `GET /api/admin/audit` |
| `/admin/monitoramento` | `components/admin/monitoring/monitoring-view.tsx` | `GET /api/admin/monitoring` |
| `/admin/configuracoes` | `components/admin/settings/settings-view.tsx` | `GET/PUT /api/admin/settings` |

Também: `/api/admin/search` (busca global), `/api/admin/notifications` (sino e contadores do menu), `/api/auth/events` (login/logout na auditoria).

**Segurança** — `app/(admin)/layout.tsx` confere o papel no servidor antes de renderizar; e toda rota `/api/admin/*` começa com `requireAdmin()` (`lib/admin/guard.ts`: sessão validada no Supabase + `super_admin` ativo + mesma origem nas alterações). As páginas não têm dados no HTML: tudo vem da API, então navegar sem recarregar não pula a checagem. Service role só no servidor.

**Dados** — `lib/admin/data.ts` (leituras), `lib/admin/catalog.ts` (tipos e regras puras: limites, alertas, períodos, formatação — testado), `lib/admin/settings.ts` (configurações e padrões), `lib/admin/audit.ts` (`recordAudit`, nunca derruba a ação), `lib/admin/usage.ts` (`recordUsage` para WhatsApp/IA). O Super Admin vê contagens, tamanhos, datas e quem acessou — nunca o conteúdo jurídico (as funções SQL agregam; a atividade do CRM sai só com tipo, autor e hora).

**Banco** (`0003_lexa_admin.sql`) — `plans` (catálogo; `organizations.plan` é FK pelo nome, renomear propaga), `subscriptions` (estado de cobrança; nasce em teste por trigger), `payments` (vazia até o gateway), `audit_logs` (só inserção), `usage_events`, `platform_settings`; status `suspended`; `current_org_id()` passa a respeitar o modo manutenção (bloqueio real, na RLS). Tabelas administrativas: RLS ligada e nenhuma política — o navegador não lê nem grava.

**Regras aplicadas de verdade** — manutenção (RLS + `requireMember`), cadastro público aberto/fechado e com/sem aprovação (`/api/auth/signup`), plano padrão, dias de teste (trigger), consulta automática de processos ligada/desligada (`lib/services/processes/lookup-http.ts`), limite de usuários do plano nos convites (opcional, em Configurações), retenção da auditoria.

**Cobrança** — sem gateway, receita é estimada pelo preço dos planos × assinaturas ativas (marcado como "estimado"). Para integrar: guardar `gateway_*_id` nos planos/assinaturas, criar a rota de webhook que grava em `payments` e atualiza `subscriptions.status` (`past_due`, `canceled`…) — o Financeiro já lê daí.

## 8. O que ainda não existe

Envio de e-mail (os links de convite e de nova senha saem no log do servidor), notificações, integrações (agenda, assinatura eletrônica, Outlook e Gmail, boletos e Pix) e cobrança automática (a estrutura de assinaturas está pronta — seção 7).

**Regra da interface:** o que não existe aparece como "Em breve" ou não aparece. Nenhum botão, status ou mensagem de sucesso simula uma funcionalidade. Em Configurações › Integrações, o WhatsApp mostra o estado real, com a mesma leitura da Central de Atendimento (`lib/whatsapp/connection.ts`).

Autenticação, banco, isolamento, arquivos de documentos, a consulta de processos, o monitoramento automático (depende do agendador da hospedagem), a Triagem (intimações do DJEN — captura desligada por padrão; depende da hospedagem no Brasil — e movimentações relevantes), o salvamento dos processos, os prazos, o WhatsApp (Z-API), a Íntegra IA e todo o painel Admin são reais.

## 9. Como rodar

Primeira vez: rode as migrações de `supabase/migrations/` em ordem numérica no SQL Editor do Supabase e preencha o `.env.local` a partir do `.env.example` (URL, anon key, service role, e-mail e senha do Super Admin).

```bash
npm run dev      # http://localhost:3000
npm test         # CNJ, consulta (cliente HTTP, cache, SWR, isolamento, erros), mapper, interpretador, timeline, permissões, financeiro, WhatsApp
npm run lint
npx tsc --noEmit
```

## 10. Íntegra IA

Inteligência sobre os dados que já estão na Íntegra. O usuário pede, o servidor monta o contexto, o modelo interpreta, a tela mostra — e o usuário decide.

```
Botão / chat (components/ai/*)            nunca chama a IA sem clique; nada de SDK no navegador
    ↓ fetch                                lib/ai/client.ts
app/api/ai/*  →  lib/ai/http.ts            IA ligada? → requireMember(permissão) → corpo validado (input.ts)
    ↓
lib/ai/context/repository.ts               somente leitura: sessão do usuário (RLS) + filtro organization_id + permissão do módulo
    ↓
lib/ai/context/{process,client,office}.ts  escolhe campos e limita volume; refs curtas (M1, T1, P1) → fontes reais
    ↓ sanitizeAIContext                    remove senha/token/e-mail/CPF/raw/storagePath/organizationId…
lib/ai/services/*  →  services/run.ts      cache no banco (cache.ts) + pedido igual em andamento → reserva no banco (metering.ts)
    ↓                                      → provedor → schema (schemas/) → grounding.ts (refs inexistentes saem; data/prazo sem origem = aviso)
    ↓                                      → consumo em usage_events (modelo, tokens, custo, erro) → log seguro
lib/ai/provider.ts  →  lib/ai/gemini.ts    único arquivo que importa @google/genai; modelo por nível (standard/light)
```

**Rotas** — `POST /api/ai/process/summary` · `process/analyze-movement` · `process/next-actions` · `client/summary` · `office/overview` · `chat`, `GET /api/ai/status` (ligada/configurada; não chama o modelo) e `GET /api/ai/usage` (uso do mês contra o plano). Erro sempre como `{ error: { code, message } }` (`lib/ai/errors.ts`), nunca detalhe interno.

**Modelo reserva** — `AI_FALLBACK_MODEL` (lista): se o principal responder 503 (sobrecarga), 429 (cota) ou 404, `gemini.ts` tenta os reservas dentro do mesmo tempo máximo; sem reserva, repete o principal uma vez. O log (`model`) mostra quem respondeu.

**Trocar de provedor** — implemente `AIProvider` (`generateText` e `generateJSON`) e escolha-o em `createAIProvider` (`lib/ai/provider.ts`). Contexto, prompts, schemas, rotas e telas não mudam.

**Regras do modelo** — prompt único em `lib/ai/prompts/system.ts` (fato × inferência × limitação; sem prazos, jurisprudência ou fatos inventados; dados tratados como dados). Mudou o texto? Suba `PROMPT_VERSION`. Instruções de cada funcionalidade em `prompts/tasks.ts`; formato das respostas em `schemas/`.

**Provedor e modelos** — um provedor só no núcleo (Gemini): toda chamada passa por `lib/ai/provider.ts`, e os nomes de modelo só existem em `lib/ai/config.ts`, lidos do ambiente: `AI_MODEL` (análises e chat) e `AI_MODEL_LIGHT` (operações simples: Triagem automática e análise de uma movimentação; padrão Flash-Lite, sem raciocínio). Se o leve falhar, o principal responde. A Central de Atendimento (WhatsApp) usa a Anthropic em `lib/services/whatsapp/ai.ts` e fica fora desta camada por enquanto.

**Custo e consumo** — cada chamada é reservada no banco antes de ir ao modelo (`ai_reserve`, `0013_ia_consumo.sql`) e registrada depois (`ai_finish`) em `usage_events`: escritório, pessoa (ou nenhuma, se automática), operação, provedor, modelo, tokens de entrada/saída/cache, custo estimado em US$ (`lib/ai/pricing.ts`, sobreposto por `AI_PRICES`), duração e erro — nunca prompt ou resposta. Admin › Consumo de IA mostra por escritório e período.

**Limites** — no banco, atômicos por escritório (trava transacional), valendo com vários servidores: limite mensal do plano (`plans.max_ai_requests`, ou `custom_limits.ai` do escritório; só contam chamadas que chegaram ao modelo) e ritmo de 8/min e 60/h por pessoa e 200/h por escritório (regras em `guard.ts`). Estourou o plano → `PLAN_LIMIT`; o ritmo → `RATE_LIMITED`, com `Retry-After`. Sem conseguir reservar, o modelo não é chamado.

**Cache** — análises idênticas (mesmo escritório, operação, modelo, prompt e contexto — que inclui a data de hoje) são reaproveitadas por 12 h a partir de `ai_result_cache`, por todos os servidores; o acerto é registrado como "cache" e não conta no plano. O prefixo estável (instruções de sistema) aproveita o cache implícito do Gemini, medido em `cached_tokens`.

**Contexto enxuto** — `repository.ts` pede ao banco só o recorte de cada análise: tarefas, prazos, compromissos futuros e documentos recentes do processo; do cliente e dos processos dele; no panorama, contagens (clientes, documentos), tarefas pendentes, prazos abertos, agenda da semana e faturas em aberto/do mês. Até 20 movimentações, listas curtas, chat com 10 mensagens.

**Privacidade** — Configurações › Integrações › "Íntegra IA e privacidade" diz o que usa IA, o que é enviado (só o necessário; CPF, CNPJ, e-mails e telefones retirados ou mascarados) e para quê; cada análise traz a nota com o link.

**Tarefas sugeridas** — nunca são gravadas pela IA: "Criar tarefa" abre `openDialog("task", { title, description, priority, processId })`, o mesmo formulário da Íntegra.

**Chat** — sem estado no servidor: o navegador manda o escopo (`process`, `client` ou `office`) e o histórico curto; o contexto é remontado do banco a cada pergunta.

**Camada na interface** — há um único painel de conversa, em `LexaAIProvider` (`components/ai/lexa-ai-provider.tsx`, montado no `AppShell`). O contexto vem da rota: `/processos/[id]` → processo, `/clientes/[id]` → cliente, o resto → escritório, com perguntas próprias de cada tela (`components/ai/ai-context.ts`). Abra com `useLexaAI().open()` ou envie uma pergunta com `ask(prompt, contexto?)` — sempre a partir de um clique. A conversa pertence ao contexto (`key` do escopo): trocar de processo começa outra. Uma tela que quer tratar as fontes citadas (ex.: abrir a movimentação ali mesmo) usa `useAISourceHandler`. Gatilhos: botão "IA" no topo, Ctrl K ("Perguntar à Íntegra: …"), painéis de Painel/Cliente/Processo, detalhe da tarefa e Agenda.

**Documentos** — ainda não entram na análise (só nome, tipo e data). Para ler o conteúdo, o caminho é um novo context builder que baixe o arquivo do Storage no servidor e o envie como parte da mensagem.

Variáveis: `GEMINI_API_KEY`, `AI_MODEL`, `AI_MODEL_LIGHT`, `AI_FALLBACK_MODEL`, `AI_PRICES`, `AI_ENABLED`, `AI_TIMEOUT_MS` (veja `.env.example`). Testes: `lib/ai/core.test.ts` e `lib/ai/services/services.test.ts`.
