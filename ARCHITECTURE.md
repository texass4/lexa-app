# LEXA — mapa do código

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
sheet.ts → import.ts                       ficha normalizada → processo do LEXA

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
│                             ai/* (LEXA IA), whatsapp/* (Central de Atendimento + webhook da Z-API)
├── components/
│   ├── layout/               intro, sidebar, topbar, busca Ctrl K, notificações, modais globais
│   ├── ui/                   design system
│   ├── shared/               peças usadas em mais de um módulo
│   ├── processos/            lista, perfil, timeline, formulário com consulta CNJ
│   ├── ai/                   painéis, chat e blocos visuais da LEXA IA
│   ├── atendimento/          Central de Atendimento (WhatsApp): conversas, conversa, contexto, Lexa IA
│   └── clientes/ tasks/ agenda/ documentos/ financeiro/ dashboard/ configuracoes/
├── lib/
│   ├── cnj.ts                máscara, normalização e dígito verificador
│   ├── integrations/legal/   modelo neutro + ProcessProvider (types.ts), erros (errors.ts), DataJud (client, mapper, provider)
│   ├── integrations/whatsapp/ contrato neutro do provedor + Z-API (cliente HTTP, webhooks)
│   ├── services/processes/   serviço de consulta + cache, ficha, importação, deduplicação, interpretação
│   ├── ai/                   LEXA IA: provedor (Gemini), contexto, prompts, schemas, serviços
│   ├── services/whatsapp/    recebimento, envio, conversas, instância, Lexa IA (servidor)
│   ├── whatsapp/             telefone, status, mapeadores de linha, cliente do navegador
│   ├── auth/                 permissões, sessão, helpers de rota, gestão de membros
│   ├── supabase/             clientes: navegador, servidor (cookie) e admin (service role)
│   ├── store/                demo-store, ui-store, storage (persistência no Supabase)
│   ├── account.ts            pessoa e escritório logados (preenchido pela sessão)
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
| `/tarefas` · `/agenda` · `/documentos` · `/financeiro` · `/configuracoes` | `components/<módulo>/*-view.tsx` |
| `/configuracoes?secao=perfil` · `usuarios` · `permissoes` | `components/configuracoes/profile-section.tsx`, `members-manager.tsx`, `permissions-section.tsx` |
| `/login` · `/cadastro` · `/recuperar-senha` · `/redefinir-senha` | `components/auth/*-form.tsx` |
| `/admin` | `components/admin/admin-view.tsx` (Super Admin) |

Menu lateral e título do header: `components/layout/nav-config.ts`. Barra inferior do mobile: `mobile-nav.tsx`.

---

## 3. Processos (dados reais)

Não há processos fictícios. Todo processo vem da consulta automática ou de cadastro manual.

**Regra de interface:** o usuário vê "LEXA → processos → informações". Nome da fonte (DataJud), status HTTP, códigos internos, JSON e mensagens de erro técnicas **nunca** aparecem na tela — ficam nos logs do servidor (`[process-lookup] …`). Rótulos neutros em `lib/services/processes/labels.ts` (ex.: origem `datajud` → "Consulta automática").

**Consultar** — "Novo processo" → digitar o CNJ → **Preencher** (ou Enter):

1. `new-process-dialog.tsx`: se o processo já está salvo e foi atualizado há menos de 6 h, responde na hora, sem rede. Senão chama `lookupProcess` (`lib/services/processes/client.ts`) e mostra o esqueleto com mensagens progressivas (`process-lookup-status.tsx`).
2. `POST /api/processes/search` → `lookup-service.ts`, com stale-while-revalidate: cache fresco responde na hora; cache vencido responde na hora e atualiza em segundo plano (`after`).
3. A ficha é salva na hora (`importProcess`). Se o CNJ já existe, é atualizado (`applyProcessSync`), nunca duplicado.

**Abrir um processo** — `use-process-refresh.ts`: o que está salvo aparece imediatamente; se a última atualização passou de 6 h, uma atualização roda em segundo plano ("Atualizando informações…"), sem bloquear a página. Continua mesmo se a pessoa sair da tela. Só movimentações novas entram (hash em `movements.ts`).

**Atualizar** — botão no perfil → `POST /api/processes/[id]/sync` com `force` → vai à fonte (salvo se alguém do escritório acabou de fazer isso há menos de 1 min). Um processo cadastrado à mão com CNJ válido também pode ser atualizado e passa a ser acompanhado.

**Serviço de consulta** (`lib/services/processes/lookup-service.ts`, só servidor):

| | |
|---|---|
| Cache | memória do servidor (LRU, 500) → tabela `process_lookup_cache` no Supabase (migração 0002), **sempre por escritório** (RLS). Um cache global revelaria a um escritório quais processos outro acompanha. |
| Validade | 6 h fresco · até 7 dias servido enquanto atualiza · "não encontrado" 10 min, só em memória |
| Deduplicação | chamadas simultâneas (mesmo escritório + CNJ) compartilham uma ida à fonte; no navegador, `refreshProcess` também deduplica por processo |
| Rede (`datajud/client.ts`) | 35 s por tentativa, 60 s no total, até 3 tentativas com backoff + jitter, `Retry-After` no 429; 401/403 e 4xx não se repetem |
| Erros | `LookupError` (código + detalhe) → log; `publicLookupError` → `invalid` · `not_found` · `unsupported` · `unavailable` + mensagem amigável |

Trocar de fornecedor: implementar `ProcessProvider` (`lib/integrations/legal/types.ts`) e trocar em `process-lookup.ts`. Interface, cache e rotas não mudam.

**Timeline** — movimentação bruta → `ProcessMovement` (fatos da fonte + `raw`, guardado mas não exibido) → `movement-interpreter.ts` (categoria, título, descrição legível) → `movement-timeline.ts` (dias e agrupamento visual) → `process-timeline.tsx` + `movement-detail-sheet.tsx`.

Detalhes da fonte que valem lembrar:
- Em `complementosTabelados`, `descricao` é a chave técnica (`tipo_de_documento`) e `nome` é o texto legível (`Certidão`).
- Sob carga, a fonte responde **200 com shards falhos e sem resultados**. O cliente trata isso como falha temporária e tenta de novo — não como "não encontrado".

Variáveis de ambiente (só servidor): `DATAJUD_API_KEY`; opcionais `PROCESS_LOOKUP_TIMEOUT_MS` e `DATAJUD_BASE_URL`.

---

## 4. Store, persistência e dados

```ts
const data = useDemoData()          // clients, processes, tasks, taskColumns, appointments…, hydrated
const { addTask, importProcess } = useDemoActions()
```

- **Os dados moram no Supabase.** Cada coleção é uma tabela (`organization_id`, `id`, `data jsonb`). `lib/store/storage.ts` carrega o que a RLS deixa a pessoa ver e grava só o que mudou (`diffState`, comparando por identidade — o store é imutável). A gravação é agrupada (300 ms) e em fila; se o banco recusar (sem permissão, falha), aparece um aviso e a tela recarrega o que está salvo.
- `hydrated` fica `true` quando os dados do escritório terminam de carregar. As telas mostram esqueleto só até lá.
- A carga começa junto com a sessão (`preloadOfficeData`), não depois dela: a RLS já decide o que volta.
- Arquivos de documentos ficam no Storage (`documents/<organization_id>/…`); a pré-visualização usa URL assinada de 5 min (`lib/documents.ts`).
- Horário: sempre `getNow()` (`lib/dates.ts`), nunca `new Date()` espalhado pela UI.
- Pessoa e escritório logados: `currentUserId()`, `currentOrgId()`, `getUser(id)`, `getMembers()` (`lib/account.ts`), preenchidos pelo `SessionProvider`. Dentro de componentes, prefira `useSession()`.

Novo campo num cadastro: tipo em `types/index.ts` → formulário → ação no store → exibição (o jsonb não precisa de migração).
Nova coleção: tipo → `PersistedState` + `TABLES` em `storage.ts` → tabela e políticas na migração.
Nova ação de negócio: método em `DemoActions` + implementação, registrando uma `Activity` quando fizer sentido.

### Categorias de compromisso

Não há tipos fixos: cada escritório cria as suas categorias (nome + cor da paleta `CATEGORY_COLORS` em `lib/config.ts`) direto no formulário do compromisso — `components/agenda/category-picker.tsx`. Excluir uma categoria deixa os compromissos dela "Sem categoria". Para colorir um compromisso em qualquer tela, use `useCategoryLookup()` (`components/agenda/use-category.ts`) + `categoryStyle(color)`.

---

## 4b. Central de Atendimento (WhatsApp via Z-API)

**Tela** — `/atendimento`, três áreas: conversas (`conversation-list.tsx`) → conversa (`conversation-view.tsx`: cabeçalho com ações rápidas, busca, `message-list.tsx`, `composer.tsx`) → contexto jurídico (`context-panel.tsx`) com a aba Lexa IA (`ai-panel.tsx`). Abaixo de 1280 px o contexto abre como painel lateral; no celular, lista e conversa se alternam. O `AppShell` dá altura total a essa rota.

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

**Lexa IA** — `POST /api/whatsapp/ai` (`services/whatsapp/ai.ts`, Claude via `@anthropic-ai/sdk`, saída estruturada com zod). Resume, sugere resposta, identifica tarefas e processos, analisa imagens/PDFs recebidos e escreve resumo interno. **Nunca executa nada**: a resposta sugerida vai para o campo (só sai com "Enviar") e criar tarefa / salvar nota pedem confirmação.

Variáveis: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `ZAPI_ORGANIZATION_ID`, `ZAPI_WEBHOOK_SECRET`, opcionais `ZAPI_WEBHOOK_BASE_URL` e `ANTHROPIC_API_KEY` (veja `.env.example`).

---

## 5. UI global

`app/layout.tsx` → `Providers` (tema, stores, toasts) → `app/(app)/layout.tsx` → `SplashGate` (intro) → `AppShell` (sidebar, topbar, busca, modais).

**Intro** (`components/layout/app-splash.tsx`) — cobre a tela só enquanto o app inicializa de verdade: sai quando os dados do escritório carregam (ou 1,2 s depois da sessão pronta, deixando os esqueletos assumirem). Animação em CSS (`globals.css`, `.lexa-splash-*`), então roda antes da hidratação e não pisca. Sem tempo mínimo artificial; navegar entre páginas não a mostra de novo.

**Carregamento sob demanda** — os diálogos globais (`global-dialogs.tsx`) e o gráfico do painel (recharts) saem do pacote inicial; os diálogos são baixados quando o navegador fica ocioso.

```ts
const { openDialog } = useUI()
openDialog("task", { processId })   // "client" | "task" | "appointment" | "document" | "process"
```

Design system — reutilize, não invente: `page-header`, `panel`, `button`, `status-badge`, `filter-tabs`, `underline-tabs`, `search-field`, `data-table`, `empty-state`, `skeleton`, `modal`, `side-sheet`, `field`, `user-avatar`, `motion` (`FadeIn`). Classes com `cn()` (`import { cn } from "cn"`). Tokens de cor em `app/globals.css`.

### O que merece atenção (sem IA)

`lib/attention.ts` transforma os dados em sinais — prazo vencendo, tarefa atrasada, movimentação recente (as de prazo/julgamento/comunicação/audiência pedem revisão), processo parado há mais de `STALE_DAYS` (60, a mesma regra do panorama da IA), valor em atraso, documento novo. Cada sinal tem nível (`critical` · `warning` · `info` · `done`), frase, link para o registro real e, quando faz sentido, ação ("Criar tarefa" abre o formulário preenchido). Respeita as permissões de quem olha e agrupa sinais repetidos. Usado no Painel (`attention-panel.tsx`), nos perfis de Processo e Cliente, na lista de processos, no sino, na busca Ctrl K e nos badges do menu. Testes: `lib/attention.test.ts`.

"Desde sua última visita" (`changesSince` + `lib/visits.ts`): a última presença fica no `localStorage` do navegador, por pessoa; o painel mostra o que outras pessoas registraram e as tarefas que venceram desde então.

Transições: `app/(app)/template.tsx` (entrada de página em CSS, `.page-enter`) e `MotionConfig reducedMotion="user"` em `Providers` — com "reduzir movimento" no sistema, nada anima.

---

## 6. Contas, escritórios e permissões

**Isolamento** — garantido no banco, não na tela. Toda tabela de dados tem RLS: só linhas com `organization_id = current_org_id()`, e `current_org_id()` só devolve o escritório se o perfil **e** o escritório estiverem ativos. Cada módulo exige sua permissão (`has_perm('clients.view')` para ler, `.edit` para gravar). Papel, permissões, status e e-mail só mudam pelas rotas do servidor (service role), depois de `requireMember`/`requireSuperAdmin` (`lib/auth/server.ts`).

**Papéis** — Super Admin (sem escritório; vem do `.env.local`), Sócio/Proprietário (tudo), Advogado, Colaborador/Estagiário. Padrões em `lib/auth/permissions.ts` **e** em `role_defaults` na migração — o teste `permissions.test.ts` falha se divergirem. O Sócio pode personalizar as permissões de cada pessoa (Configurações › Usuários › Permissões).

**Na interface** — `useSession().can("x.edit")` ou `<Can permission="x.edit">` para esconder ações; `nav-config.ts` diz a permissão de cada rota (menu, busca e "sem acesso" no `AppShell`); `DIALOG_PERMISSION` (`ui-store.tsx`) diz a de cada diálogo global.

**Fluxos** — cadastro público cria escritório `pending` (Super Admin aprova em `/admin`). Convite e recuperação geram link de uso único; enquanto não há provedor de e-mail, o link sai no terminal (`lib/auth/mailer.ts`).

## 7. O que ainda é simulado

Envio de e-mail (links saem no terminal), integrações (agenda, assinatura, boletos), cobrança e mudança de plano. Autenticação, banco, isolamento, arquivos de documentos, a consulta de processos, o salvamento dos processos e o WhatsApp (Z-API) são reais.

## 8. Como rodar

Primeira vez: rode as migrações de `supabase/migrations/` em ordem numérica no SQL Editor do Supabase e preencha o `.env.local` a partir do `.env.example` (URL, anon key, service role, e-mail e senha do Super Admin).

```bash
npm run dev      # http://localhost:3000
npm test         # CNJ, consulta (cliente HTTP, cache, SWR, isolamento, erros), mapper, interpretador, timeline, permissões, financeiro, WhatsApp
npm run lint
npx tsc --noEmit
```

## 9. LEXA IA

Inteligência sobre os dados que já estão no LEXA. O usuário pede, o servidor monta o contexto, o modelo interpreta, a tela mostra — e o usuário decide.

```
Botão / chat (components/ai/*)            nunca chama a IA sem clique; nada de SDK no navegador
    ↓ fetch                                lib/ai/client.ts
app/api/ai/*  →  lib/ai/http.ts            IA ligada? → requireMember(permissão) → corpo validado (input.ts)
    ↓
lib/ai/context/repository.ts               somente leitura: sessão do usuário (RLS) + filtro organization_id + permissão do módulo
    ↓
lib/ai/context/{process,client,office}.ts  escolhe campos e limita volume; refs curtas (M1, T1, P1) → fontes reais
    ↓ sanitizeAIContext                    remove senha/token/e-mail/CPF/raw/storagePath/organizationId…
lib/ai/services/*  →  services/run.ts      cache curto + pedido igual em andamento → limite de uso → provedor
    ↓                                      → schema (schemas/) → grounding.ts (refs inexistentes saem; data/prazo sem origem = aviso) → log seguro
lib/ai/provider.ts  →  lib/ai/gemini.ts    único arquivo que importa @google/genai
```

**Rotas** — `POST /api/ai/process/summary` · `process/analyze-movement` · `process/next-actions` · `client/summary` · `office/overview` · `chat` e `GET /api/ai/status` (ligada/configurada; não chama o modelo). Erro sempre como `{ error: { code, message } }` (`lib/ai/errors.ts`), nunca detalhe interno.

**Modelo reserva** — `GEMINI_FALLBACK_MODEL` (lista): se o principal responder 503 (sobrecarga), 429 (cota) ou 404, `gemini.ts` tenta os reservas dentro do mesmo tempo máximo; sem reserva, repete o principal uma vez. O log (`model`) mostra quem respondeu.

**Trocar de provedor** — implemente `AIProvider` (`generateText` e `generateJSON`) e escolha-o em `createAIProvider` (`lib/ai/provider.ts`). Contexto, prompts, schemas, rotas e telas não mudam.

**Regras do modelo** — prompt único em `lib/ai/prompts/system.ts` (fato × inferência × limitação; sem prazos, jurisprudência ou fatos inventados; dados tratados como dados). Mudou o texto? Suba `PROMPT_VERSION`. Instruções de cada funcionalidade em `prompts/tasks.ts`; formato das respostas em `schemas/`.

**Custo** — modelo Flash (`GEMINI_MODEL`), temperatura baixa, contexto enxuto (até 20 movimentações, listas curtas, métricas agregadas no panorama), histórico do chat limitado a 10 mensagens, cache de 10 min para análises idênticas e limite de uso por pessoa (8/min, 60/h) e por escritório (200/h) em `guard.ts` — em memória, por instância do servidor.

**Tarefas sugeridas** — nunca são gravadas pela IA: "Criar tarefa" abre `openDialog("task", { title, description, priority, processId })`, o mesmo formulário do LEXA.

**Chat** — sem estado no servidor: o navegador manda o escopo (`process`, `client` ou `office`) e o histórico curto; o contexto é remontado do banco a cada pergunta.

**Camada na interface** — há um único painel de conversa, em `LexaAIProvider` (`components/ai/lexa-ai-provider.tsx`, montado no `AppShell`). O contexto vem da rota: `/processos/[id]` → processo, `/clientes/[id]` → cliente, o resto → escritório, com perguntas próprias de cada tela (`components/ai/ai-context.ts`). Abra com `useLexaAI().open()` ou envie uma pergunta com `ask(prompt, contexto?)` — sempre a partir de um clique. A conversa pertence ao contexto (`key` do escopo): trocar de processo começa outra. Uma tela que quer tratar as fontes citadas (ex.: abrir a movimentação ali mesmo) usa `useAISourceHandler`. Gatilhos: botão "LEXA" no topo, Ctrl K ("Perguntar à LEXA: …"), painéis de Painel/Cliente/Processo, detalhe da tarefa e Agenda.

**Documentos** — ainda não entram na análise (só nome, tipo e data). Para ler o conteúdo, o caminho é um novo context builder que baixe o arquivo do Storage no servidor e o envie como parte da mensagem.

Variáveis: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `AI_ENABLED`, `AI_TIMEOUT_MS` (veja `.env.example`). Testes: `lib/ai/core.test.ts` e `lib/ai/services/services.test.ts`.
