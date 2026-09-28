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
```

---

## 1. Pastas

```
lexa-app/
├── app/                      rotas (páginas finas: metadata + view)
│   ├── (app)/                shell autenticado: dashboard, clientes, processos,
│   │                         tarefas, agenda, documentos, financeiro, configuracoes
│   ├── (auth)/               login, cadastro, recuperar-senha, redefinir-senha
│   ├── (admin)/admin         painel do Super Admin (papel checado no servidor)
│   ├── auth/confirm          troca o token dos links (recuperação/convite) por sessão
│   └── api/                  processes/* (consulta), auth/* (cadastro, recuperação),
│                             team/users (gestão do escritório), me/email, admin/*
├── components/
│   ├── layout/               intro, sidebar, topbar, busca Ctrl K, notificações, modais globais
│   ├── ui/                   design system
│   ├── shared/               peças usadas em mais de um módulo
│   ├── processos/            lista, perfil, timeline, formulário com consulta CNJ
│   └── clientes/ tasks/ agenda/ documentos/ financeiro/ dashboard/ configuracoes/
├── lib/
│   ├── cnj.ts                máscara, normalização e dígito verificador
│   ├── integrations/legal/   modelo neutro + ProcessProvider (types.ts), erros (errors.ts), DataJud (client, mapper, provider)
│   ├── services/processes/   serviço de consulta + cache, ficha, importação, deduplicação, interpretação
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

## 5. UI global

`app/layout.tsx` → `Providers` (tema, stores, toasts) → `app/(app)/layout.tsx` → `SplashGate` (intro) → `AppShell` (sidebar, topbar, busca, modais).

**Intro** (`components/layout/app-splash.tsx`) — cobre a tela só enquanto o app inicializa de verdade: sai quando os dados do escritório carregam (ou 1,2 s depois da sessão pronta, deixando os esqueletos assumirem). Animação em CSS (`globals.css`, `.lexa-splash-*`), então roda antes da hidratação e não pisca. Sem tempo mínimo artificial; navegar entre páginas não a mostra de novo.

**Carregamento sob demanda** — os diálogos globais (`global-dialogs.tsx`) e o gráfico do painel (recharts) saem do pacote inicial; os diálogos são baixados quando o navegador fica ocioso.

```ts
const { openDialog } = useUI()
openDialog("task", { processId })   // "client" | "task" | "appointment" | "document" | "process"
```

Design system — reutilize, não invente: `page-header`, `panel`, `button`, `status-badge`, `filter-tabs`, `underline-tabs`, `search-field`, `data-table`, `empty-state`, `skeleton`, `modal`, `side-sheet`, `field`, `user-avatar`, `motion` (`FadeIn`). Classes com `cn()` (`import { cn } from "cn"`). Tokens de cor em `app/globals.css`.

---

## 6. Contas, escritórios e permissões

**Isolamento** — garantido no banco, não na tela. Toda tabela de dados tem RLS: só linhas com `organization_id = current_org_id()`, e `current_org_id()` só devolve o escritório se o perfil **e** o escritório estiverem ativos. Cada módulo exige sua permissão (`has_perm('clients.view')` para ler, `.edit` para gravar). Papel, permissões, status e e-mail só mudam pelas rotas do servidor (service role), depois de `requireMember`/`requireSuperAdmin` (`lib/auth/server.ts`).

**Papéis** — Super Admin (sem escritório; vem do `.env.local`), Sócio/Proprietário (tudo), Advogado, Colaborador/Estagiário. Padrões em `lib/auth/permissions.ts` **e** em `role_defaults` na migração — o teste `permissions.test.ts` falha se divergirem. O Sócio pode personalizar as permissões de cada pessoa (Configurações › Usuários › Permissões).

**Na interface** — `useSession().can("x.edit")` ou `<Can permission="x.edit">` para esconder ações; `nav-config.ts` diz a permissão de cada rota (menu, busca e "sem acesso" no `AppShell`); `DIALOG_PERMISSION` (`ui-store.tsx`) diz a de cada diálogo global.

**Fluxos** — cadastro público cria escritório `pending` (Super Admin aprova em `/admin`). Convite e recuperação geram link de uso único; enquanto não há provedor de e-mail, o link sai no terminal (`lib/auth/mailer.ts`).

## 7. O que ainda é simulado

Envio de e-mail (links saem no terminal), integrações (WhatsApp, agenda, assinatura, boletos), cobrança e mudança de plano. Autenticação, banco, isolamento, arquivos de documentos, a consulta de processos e o salvamento dos processos são reais.

## 8. Como rodar

Primeira vez: rode `supabase/migrations/0001_lexa_auth.sql` e depois `0002_process_lookup_cache.sql` no SQL Editor do Supabase e preencha o `.env.local` a partir do `.env.example` (URL, anon key, service role, e-mail e senha do Super Admin).

```bash
npm run dev      # http://localhost:3000
npm test         # CNJ, consulta (cliente HTTP, cache, SWR, isolamento, erros), mapper, interpretador, timeline, permissões, financeiro
npm run lint
npx tsc --noEmit
```
