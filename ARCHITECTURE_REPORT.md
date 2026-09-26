# LEXA — Relatório Técnico de Arquitetura

> **Escopo e método.** Análise estática do código no branch `claude/modest-ptolemy-nkt8sl` (commit `042e353`). Foram lidos ~200 arquivos (≈19.400 linhas, sem contar `package-lock.json`). Nenhum arquivo do projeto foi alterado; o único arquivo criado é este relatório. A suíte de testes foi executada apenas para leitura do resultado (`npm test` → 80 testes, 80 passando). `node_modules/` **não estava instalado** no ambiente, então nada foi inferido a partir do código das bibliotecas — só do `package.json`/`package-lock.json`.
>
> **Convenções de linguagem usadas no relatório**
> - **"Observei no código…"** → fato verificado, com arquivo/função citados.
> - **"Isso sugere…"** → inferência minha.
> - **"Potencial risco…"** → risco técnico identificado.
> - **"Não foi possível determinar pelo código analisado."** → fora do alcance do código.
>
> **Aviso importante antes de ler:** o pedido menciona LEXA IA/Gemini e WhatsApp como módulos. **Nenhum dos dois está implementado no código.** Não há SDK do Gemini, nem chamada a modelos de IA, nem provider/webhook de WhatsApp. As seções 20 e 21 documentam exatamente o que existe (menções de interface e simulações) e onde esses módulos se encaixariam.

---

## Sumário

1. Resumo executivo
2. Stack
3. Arquitetura geral
4. Estrutura de pastas
5. Frontend
6. Backend
7. Banco de dados
8. Autenticação
9. Autorização
10. Multi-tenant
11. Clientes
12. Processos
13. Movimentações
14. DataJud
15. Tarefas
16. Agenda
17. Documentos
18. Financeiro
19. Dashboard
20. WhatsApp
21. LEXA IA / Gemini
22. APIs
23. Estado do frontend
24. Fluxos críticos
25. Regras de negócio
26. Segurança
27. Performance
28. Arquivos críticos
29. Acoplamento
30. Dívida técnica
31. Testes
32. Deploy
33. Diagrama completo
34. Modelo mental do LEXA
35. Guia: onde alterar cada funcionalidade
36. Guia: arquivos críticos ("onde não mexer")
37. Glossário técnico
38. Conclusão

---

## 1. Resumo executivo

### O que o LEXA é, tecnicamente

O LEXA é uma aplicação **Next.js 16 (App Router) + React 19 + TypeScript**, com **Supabase** (Postgres + Auth + Storage) como backend de dados e um **script Python** (`python/datajud.py`) que consulta a API pública do **DataJud (CNJ)**. É um SaaS **multi-tenant** para escritórios de advocacia, com isolamento por escritório garantido por **Row Level Security (RLS)** no Postgres.

A característica arquitetural mais importante — e menos óbvia — é esta:

> **Quase toda a lógica de negócio roda no navegador.** O CRUD de clientes, processos, tarefas, agenda, documentos etc. **não passa por API Routes do Next.js**. O navegador carrega todas as coleções do escritório diretamente do Supabase (PostgREST) para um store React em memória (`lib/store/demo-store.tsx`), as ações alteram esse store, e um mecanismo de sincronização (`lib/store/storage.ts`) grava as diferenças de volta no Supabase, também direto do navegador. Quem protege os dados é a **RLS do banco**, não o servidor Next.

O servidor Next.js (API Routes) só existe para três coisas: **(1)** consulta processual ao DataJud (porque exige execução do Python e a chave da API), **(2)** operações que exigem a *service role* do Supabase (cadastro público, convites, gestão de usuários, troca de e-mail, recuperação de senha) e **(3)** painel do Super Admin.

### Stack em uma linha

Next.js 16.3.6 · React 19.2.8 · TypeScript 5.9 · Tailwind CSS 4 · Base UI (`@base-ui/react`) + estilo shadcn · Supabase (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.117.2) · Python 3 + `requests` + SQLite (cache) · Recharts · framer-motion · lucide-react · sonner (toasts) · cmdk (busca Ctrl+K) · testes com `node --test` nativo.

### Principais módulos (todos com UI em `components/<módulo>/`)

| Módulo | Estado real no código |
|---|---|
| Autenticação/contas/escritórios | **Real** — Supabase Auth, RLS, rotas de servidor, Super Admin |
| Clientes | **Real** (criar, editar parcial, excluir, perfil com abas) |
| Processos | **Real** (manual + importação DataJud, sincronização manual, timeline) |
| Movimentações | **Real**, embutidas dentro do processo (não há tabela própria) |
| Tarefas | **Real** (lista + Kanban com colunas customizáveis) |
| Agenda | **Real** (criar, excluir, categorias; **sem edição e sem recorrência**) |
| Documentos | **Real** (upload para Supabase Storage, preview por URL assinada) |
| Financeiro | **Somente leitura** — tabela `invoices` existe e é lida, mas **não há nenhuma tela nem ação que crie/edite faturas** |
| Dashboard | **Real**, 100% calculado no navegador a partir do store |
| Notificações | **Estrutura** — tabela e menu existem, mas **nada no código cria notificações** |
| WhatsApp | **Inexistente** — apenas textos/botões simulados (toasts) |
| LEXA IA / Gemini | **Inexistente** |

### Banco

12 tabelas no schema `public` (migração única `supabase/migrations/0001_lexa_auth.sql`): `organizations`, `profiles` (relacionais, colunas tipadas) e **10 tabelas de dados em formato documento** — `clients`, `processes`, `tasks`, `task_columns`, `appointments`, `appointment_categories`, `documents`, `invoices`, `activities`, `notifications` — todas com o mesmo formato `(organization_id, id, data jsonb, created_at, updated_at)`. A entidade inteira fica dentro de `data`. **Relacionamentos entre entidades (cliente↔processo, tarefa↔processo…) são IDs dentro do JSON e não são chaves estrangeiras** — o banco não os conhece. Há ainda 2 buckets de Storage (`avatars` público, `documents` privado) e um cache SQLite local do DataJud (`.data/datajud_cache.db`).

### Integrações externas

| Integração | Onde | Status |
|---|---|---|
| Supabase (Postgres/Auth/Storage) | `lib/supabase/*`, `lib/store/storage.ts`, rotas `app/api/**` | Real |
| DataJud (API Pública CNJ) | `python/datajud.py` chamado por `lib/services/processes/python-lookup.ts` | Real |
| E-mail | `lib/auth/mailer.ts` | **Simulado** — link impresso no terminal |
| WhatsApp, Google Agenda, assinatura, boletos, Outlook/Gmail | `components/configuracoes/settings-view.tsx` | **Simulado** (toast "Ambiente de demonstração") |
| Gemini / IA | — | Inexistente |

### Autenticação e autorização

- Login por e-mail/senha com `supabase.auth.signInWithPassword` **no navegador** (`components/auth/login-form.tsx`). Sessão em **cookies** gerenciados por `@supabase/ssr`.
- `proxy.ts` (o "middleware" do Next 16) valida o usuário a cada requisição com `supabase.auth.getUser()` e redireciona para `/login` quem não está logado.
- Papéis: `super_admin`, `owner` (Sócio), `lawyer` (Advogado), `staff` (Colaborador/Estagiário). Permissões por módulo (`clients.view`, `clients.edit`, …, `office.manage`, `users.manage`), com personalização por usuário.
- A autorização **real** está em: RLS (`current_org_id()`, `has_perm()`), políticas do Storage e helpers de rota `requireMember`/`requireSuperAdmin` (`lib/auth/server.ts`). No frontend, `useSession().can()` e `<Can>` apenas escondem elementos.

### DataJud

Fluxo: formulário → `POST /api/processes/search` → `spawn(python3 datajud.py --events)` → HTTP ao DataJud com retry/backoff/429/respostas parciais → NDJSON de eventos para o navegador em tempo real → `mapper.ts` (JSON bruto → `ExternalProcess`) → `sheet.ts` (→ `ProcessSheet`) → no navegador, `importProcess`/`applyProcessSync` grava no store → sincronização com Supabase. Deduplicação de movimentações por hash FNV‑1a. **Não há sincronização automática/agendada** — só manual.

### Principais pontos técnicos (resumo)

**Fortes:** isolamento multi-tenant bem desenhado na camada de banco (RLS + funções `security definer` + GRANT por coluna); fronteira de integração processual limpa (`ExternalProcess`/`ProcessSheet`); tratamento cuidadoso de fuso horário e de dados brutos do DataJud; testes para as partes puras mais delicadas (CNJ, mapper, hash, interpretador, timeline, diff de persistência, paridade de permissões TS×SQL).

**Riscos principais:** (1) regras de negócio e validação **apenas no cliente** — qualquer membro com permissão de edição pode gravar JSON arbitrário direto no PostgREST; (2) carregamento **integral** de todas as coleções do escritório a cada sessão (não escala); (3) processos Python sem limite de concorrência/rate limit no servidor (até 5 min cada); (4) dependência de Python + SQLite em disco, possivelmente incompatível com hospedagem serverless; (5) links de recuperação/convite **com token válido** impressos em log; (6) gravação otimista com *rollback* que pode descartar alterações; (7) vários campos/telas que nunca recebem dados (prazos, faturas, notificações, status de cliente).

---

## 2. Stack

Versões são as resolvidas no `package-lock.json`.

| Tecnologia | Versão | Onde é usada | Problema que resolve | Arquivos principais |
|---|---|---|---|---|
| **Next.js** (App Router) | 16.3.6 | Todo o app: rotas em `app/`, API Routes, `proxy.ts`, `instrumentation.ts` | Roteamento, SSR das páginas finas, handlers HTTP no servidor | `app/**`, `next.config.ts`, `proxy.ts`, `instrumentation.ts` |
| **React** | 19.2.8 | Toda a UI (quase toda client-side, `"use client"`) | Componentização e estado | `components/**`, `lib/store/*`, `lib/auth/session.tsx` |
| **TypeScript** | 5.9.3 (`strict: true`) | Todo o código TS | Tipagem; contratos das entidades | `tsconfig.json`, `types/index.ts` |
| **Supabase JS** | `@supabase/supabase-js` 2.117.2 | Cliente do banco/Auth/Storage no navegador e no servidor | Banco, autenticação, arquivos | `lib/supabase/client.ts`, `server.ts`, `admin.ts` |
| **Supabase SSR** | `@supabase/ssr` 0.12.7 | Sessão em cookies para navegador, servidor e proxy | Sessão compartilhada entre browser e servidor | `lib/supabase/client.ts`, `lib/supabase/server.ts`, `proxy.ts` |
| **PostgreSQL (Supabase)** | — | Persistência de tudo | Banco + RLS (multi-tenant) | `supabase/migrations/0001_lexa_auth.sql` |
| **ORM** | **Nenhum** | — | O acesso é pelo query builder do supabase-js (PostgREST). Não há Prisma/Drizzle. | `lib/store/storage.ts`, `lib/auth/*` |
| **Python 3 + requests** | não fixado (sem `requirements.txt`) | Cliente HTTP do DataJud | Retry, 429, respostas parciais, cache | `python/datajud.py` |
| **SQLite** (stdlib Python) | — | Cache local de respostas do DataJud (TTL 6 h) | Evitar consultas repetidas | `python/datajud.py` (`SQLiteCache`) |
| **Tailwind CSS** | 4.3.3 (`@tailwindcss/postcss`) | Toda a estilização (classes utilitárias) | CSS | `app/globals.css`, `postcss.config.mjs` |
| **shadcn** | 4.21.0 | Só o CSS base (`@import "shadcn/tailwind.css"`) e `components.json` (estilo `base-nova`) | Tokens/estilo de design system | `app/globals.css`, `components.json` |
| **tw-animate-css** | 1.4.0 | Animações utilitárias CSS | Animações | `app/globals.css` |
| **Base UI** (`@base-ui/react`) | 1.8.0 | Primitivos acessíveis: dialog, alert-dialog, menu, popover, tooltip, button | Modais, menus e popovers acessíveis | `components/ui/modal.tsx`, `side-sheet.tsx`, `confirm-dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `button.tsx`, `layout/command-menu.tsx` |
| **class-variance-authority** | 0.7.1 | Variantes do botão | Variantes tipadas de classes | `components/ui/button.tsx` |
| **cn** | 0.4.0 | Concatenação condicional de classes (`import { cn } from "cn"`, ~60 imports) | Merge de classes | todo `components/` |
| **framer-motion** | 13.4.1 | Animações (entrada, abas, checkbox, progress bars) | Microinterações | `components/ui/motion.tsx`, `filter-tabs.tsx`, `underline-tabs.tsx`, várias views |
| **lucide-react** | 1.47.0 | Ícones | Ícones | praticamente todos os componentes |
| **Recharts** | 3.10.1 | Gráfico de receita | Gráficos | `components/financeiro/revenue-chart.tsx` |
| **sonner** | 2.0.8 | Toasts (sucesso/erro/ação "Desfazer") | Feedback ao usuário | `components/ui/sonner.tsx`, chamadas `toast()` em todo lugar |
| **cmdk** | 1.1.1 | Paleta de comandos Ctrl+K | Busca global | `components/layout/command-menu.tsx` |
| **Formulários** | **Nenhuma biblioteca** (sem react-hook-form/Formik) | Formulários com `useState` + validação manual | — | `components/**/*-dialog.tsx`, `components/auth/*-form.tsx` |
| **Validação** | **Nenhuma biblioteca** (sem Zod/Yup) | Funções manuais e regex | — | `lib/auth/validation.ts`, `lib/masks.ts`, `lib/cnj.ts`, forms |
| **Estado global** | **React Context** próprio (sem Redux/Zustand/React Query/SWR) | Store de dados, UI e sessão | — | `lib/store/demo-store.tsx`, `lib/store/ui-store.tsx`, `lib/auth/session.tsx` |
| **Datas** | **Nenhuma biblioteca** (sem date-fns/dayjs) | Utilitários próprios com `Date` nativo | Formatação pt-BR, ISO local | `lib/dates.ts` |
| **Documentos** | **Nenhuma biblioteca** de PDF/DOCX | Preview nativo do navegador (`<iframe>`, `<img>`, `<pre>`) | — | `components/shared/document-preview-sheet.tsx` |
| **Fontes** | `next/font/google` (Geist, Geist Mono, DM Serif Display) | Tipografia | — | `app/layout.tsx` |
| **ESLint** | 9.39.5 + `eslint-config-next` 16.3.6 (core-web-vitals + typescript) | Lint | Qualidade | `eslint.config.mjs` |
| **Prettier** | configuração presente (`.prettierrc`), **não está em `devDependencies`** | Formatação | — | `.prettierrc` |
| **Testes** | `node --test` nativo (Node 22, type stripping) + resolver próprio de alias | Testes unitários de `lib/` | Testes sem Jest/Vitest | `tests/register.mjs`, `tests/resolver.mjs`, `lib/**/*.test.ts` |
| **Deploy** | Não há configuração explícita (sem `vercel.json`, sem CI). `.gitignore` ignora `.vercel` | — | — | `next.config.ts`, `.gitignore` |

**Dependências declaradas mas com papel mínimo:** `shadcn` é usado só pelo CSS importado em `globals.css`; `lib/utils.ts` é um reexport de `cn` usado por dois arquivos (`components/ui/button.tsx`, `components/layout/command-menu.tsx`).

---

## 3. Arquitetura geral

### 3.1 Diagrama real de camadas

```
┌──────────────────────────────── NAVEGADOR ─────────────────────────────────┐
│                                                                             │
│  Páginas finas (app/(app)/*/page.tsx) → só renderizam uma "View"            │
│        │                                                                    │
│  Views / Componentes (components/<módulo>/*)                                │
│        │ lê: useDemoData()   age: useDemoActions()   UI: useUI()            │
│        │ permissões (visuais): useSession().can() / <Can>                   │
│        ▼                                                                    │
│  ┌──────────────────────────────┐   ┌───────────────────────────┐           │
│  │ DemoStoreProvider            │   │ SessionProvider           │           │
│  │ lib/store/demo-store.tsx     │   │ lib/auth/session.tsx      │           │
│  │ (estado + regras de negócio) │   │ → lib/account.ts (global) │           │
│  └───────────┬──────────────────┘   └──────────┬────────────────┘           │
│              │ diffState + syncState            │ profiles/organizations    │
│              ▼ (lib/store/storage.ts)           ▼                           │
│        getSupabase() — cliente do navegador (anon key + cookie de sessão)   │
│              │                                                              │
│  Consulta CNJ: lib/services/processes/client.ts ──fetch──┐                  │
│  Gestão de equipe/admin: fetch("/api/...") ──────────────┤                  │
└──────────────┼───────────────────────────────────────────┼──────────────────┘
               │ PostgREST / Auth / Storage (HTTPS)         │ HTTPS (cookies)
               ▼                                            ▼
┌──────────── SUPABASE ───────────────┐    ┌──────────── SERVIDOR NEXT.JS ─────────────┐
│ Auth (auth.users, sessão JWT)       │    │ proxy.ts  (sessão; bloqueia não logados)  │
│ Postgres + RLS                      │◄───┤ app/api/auth/*   (signup, recover)        │
│  organizations, profiles            │    │ app/api/team/*   (Sócio: equipe)          │
│  10 tabelas jsonb por escritório    │    │ app/api/admin/*  (Super Admin)            │
│  current_org_id(), has_perm()       │    │ app/api/me/email                          │
│ Storage: avatars, documents         │    │   └─ lib/auth/server.ts + members.ts      │
└─────────────────────────────────────┘    │      (service role: getSupabaseAdmin)     │
                                           │ app/api/processes/search | [id]/sync      │
                                           │   └─ python-lookup.ts ─spawn─┐            │
                                           │ instrumentation.ts → ensureSuperAdmin     │
                                           └──────────────────────────────┼────────────┘
                                                                          ▼
                                           ┌────────── python/datajud.py ──────────────┐
                                           │ retry/backoff/429/parciais; cache SQLite  │
                                           │ .data/datajud_cache.db                    │
                                           └──────────────────┬────────────────────────┘
                                                              ▼ HTTPS (APIKey)
                                           ┌──── api-publica.datajud.cnj.jus.br ───────┐
                                           └───────────────────────────────────────────┘
```

### 3.2 Leitura do diagrama

- **Frontend:** SPA-like dentro do App Router. As páginas em `app/(app)` são *Server Components* mínimos (só `metadata` + um componente client). Toda a experiência acontece em componentes `"use client"`.
- **Backend de dados:** o **Supabase é o backend real** do CRUD. Não existe camada "service/repository" no servidor Next para clientes, processos etc.
- **Backend Next.js:** handlers enxutos em `app/api/**` que usam `lib/auth/server.ts` (autorização) e `lib/auth/members.ts` (gestão de usuários) com a *service role*.
- **Autenticação:** Supabase Auth; sessão em cookie; `proxy.ts` renova e protege.
- **IA:** inexistente.
- **Processamento de dados:** normalização do DataJud (`mapper.ts`, `sheet.ts`, `import.ts`), deduplicação (`movements.ts`), interpretação/apresentação de movimentações (`movement-interpreter.ts`, `movement-timeline.ts`), cálculos financeiros (`lib/selectors.ts`). As funções de normalização rodam no **servidor** (rota) e as de interpretação/cálculo rodam no **navegador**.
- **Background jobs:** **não existem**. Nenhum cron, fila, worker, webhook ou Supabase Edge Function no repositório. O único código que roda "sozinho" é `instrumentation.ts` (uma vez, no start do servidor, para criar o Super Admin).

---

## 4. Estrutura de pastas

```
lexa-app/
├── app/                         Rotas (App Router)
│   ├── layout.tsx               HTML raiz, fontes, script de tema, <Providers>
│   ├── page.tsx                 "/" → redirect("/dashboard")
│   ├── not-found.tsx            404 fora do app
│   ├── globals.css              Tokens de cor (claro/escuro), Tailwind, shadcn CSS
│   ├── (app)/                   Área autenticada do escritório
│   │   ├── layout.tsx           SessionProvider → DemoStoreProvider → AppShell
│   │   ├── error.tsx            Error boundary do app
│   │   ├── not-found.tsx
│   │   ├── dashboard/ clientes/ clientes/[id]/ processos/ processos/[id]/
│   │   └── tarefas/ agenda/ documentos/ financeiro/ configuracoes/
│   ├── (auth)/                  login, cadastro, recuperar-senha, redefinir-senha
│   ├── (admin)/                 layout.tsx (checagem de super_admin no servidor) + admin/page.tsx
│   ├── auth/confirm/route.ts    Troca token_hash do link por sessão
│   └── api/                     18 handlers (ver seção 22)
├── components/
│   ├── ui/          (24)        Design system: button, modal, side-sheet, field, filter-tabs…
│   ├── layout/      (12)        AppShell, Sidebar, Topbar, CommandMenu, GlobalDialogs, nav-config
│   ├── shared/      (9)         Peças usadas por vários módulos (DocumentList, ActivityTimeline…)
│   ├── clientes/    (2 + profile/6)
│   ├── processos/   (7)
│   ├── tasks/       (7)
│   ├── agenda/      (9)
│   ├── documentos/  (2)
│   ├── financeiro/  (2)
│   ├── dashboard/   (7)
│   ├── configuracoes/ (6)
│   ├── admin/       (1)
│   ├── auth/        (5)
│   └── providers.tsx            UIProvider + TooltipProvider + Toaster
├── lib/
│   ├── store/                   demo-store (dados+regras), storage (Supabase), ui-store
│   ├── auth/                    permissões, sessão, helpers de rota, membros, validação, mailer
│   ├── supabase/                3 clientes: navegador, servidor (cookie), admin (service role)
│   ├── integrations/legal/      Modelo neutro + DataJud (mapper, erros, fixtures)
│   ├── services/processes/      ficha, importação, dedupe, interpretador, timeline, runner Python
│   ├── account.ts               Conta logada (singleton de módulo)
│   ├── selectors.ts             Consultas derivadas e finanças
│   ├── config.ts                Rótulos, tons de status, paleta
│   ├── dates.ts  format.ts  masks.ts  cnj.ts  documents.ts  hooks.ts  theme*.ts  utils.ts
├── python/datajud.py            Cliente DataJud (CLI + modo --events)
├── supabase/migrations/0001_lexa_auth.sql   Único arquivo de schema
├── types/index.ts               Contratos de todas as entidades
├── tests/                       Loader/resolver para `node --test`
├── proxy.ts                     "Middleware" do Next 16
├── instrumentation.ts           Hook de start do servidor
└── ARCHITECTURE.md, README.md, AGENTS.md, CLAUDE.md
```

### 4.1 Responsabilidade de cada pasta

| Pasta | Responsabilidade | Entra | Sai | Principais arquivos | Quem usa | Dependências |
|---|---|---|---|---|---|---|
| `app/(app)` | Páginas autenticadas; montar providers de sessão e dados | URL | Componente de View | `layout.tsx`, `*/page.tsx` | Next router | `components/*`, `lib/auth/session`, `lib/store/demo-store` |
| `app/(auth)` | Telas públicas de entrada | URL | Forms | `login/page.tsx` etc. | Visitante | `components/auth/*` |
| `app/(admin)` | Painel do Super Admin, com checagem **no servidor** | URL + cookie | `AdminView` ou redirect | `layout.tsx` | Super Admin | `lib/supabase/server` |
| `app/api` | Endpoints HTTP do servidor | JSON (+cookie) | JSON / NDJSON | ver seção 22 | Forms de auth, `members-manager`, `admin-view`, `services/processes/client.ts` | `lib/auth/*`, `lib/services/processes/*`, `lib/integrations/*` |
| `components/ui` | Design system sem regra de negócio | props | JSX | `modal.tsx`, `field.tsx`, `button.tsx` | todos os módulos | Base UI, framer-motion, cva |
| `components/layout` | Casca do app, navegação, diálogos globais | store, sessão | JSX | `app-shell.tsx`, `global-dialogs.tsx`, `nav-config.ts`, `command-menu.tsx` | `app/(app)/layout.tsx` | ui-store, session, demo-store |
| `components/<módulo>` | Telas de domínio | store, sessão | JSX + chamadas a actions | `*-view.tsx`, `*-dialog.tsx` | páginas | demo-store, selectors, config, dates |
| `components/shared` | Componentes cross-módulo | entidades | JSX | `document-list.tsx`, `document-preview-sheet.tsx`, `activity-timeline.tsx`, `process-list-item.tsx` | clientes, processos, documentos, dashboard | demo-store, `lib/documents` |
| `lib/store` | Estado, ações de negócio, persistência | ações | estado imutável; upserts/deletes no Supabase | `demo-store.tsx`, `storage.ts`, `ui-store.tsx` | 33 componentes (`useDemoData`), 17 (`useDemoActions`) | supabase client, services/processes, account |
| `lib/auth` | Permissões, sessão, helpers de rota, gestão de membros | perfil/cookie | `can()`, `requireMember()`… | `permissions.ts`, `session.tsx`, `server.ts`, `members.ts` | UI e API | supabase |
| `lib/supabase` | Fábricas dos clientes Supabase | env vars | `SupabaseClient` | `client.ts`, `server.ts`, `admin.ts` | store, auth, rotas | `@supabase/*` |
| `lib/integrations/legal` | Fronteira com fontes processuais | JSON bruto DataJud | `ExternalProcess` | `types.ts`, `datajud/mapper.ts`, `datajud/errors.ts` | rotas de processo | `lib/cnj` |
| `lib/services/processes` | Pipeline de processo (servidor e browser) | `ExternalProcess`/`ProcessMovement` | `ProcessSheet`, `ProcessDraft`, `LexaMovement`, `TimelineDay` | `sheet.ts`, `import.ts`, `movements.ts`, `movement-interpreter.ts`, `movement-timeline.ts`, `python-lookup.ts`, `client.ts`, `lookup-events.ts` | rotas, store, componentes de processo | integrations, format, cnj |
| `python/` | Chamada HTTP ao DataJud | CNJ (argv) | NDJSON (stdout) | `datajud.py` | `python-lookup.ts` | `requests`, `sqlite3` |
| `supabase/migrations` | Schema, RLS, funções, buckets | — | — | `0001_lexa_auth.sql` | aplicado manualmente | — |
| `types` | Contratos das entidades | — | tipos | `index.ts` | 52 arquivos | — |
| `tests` | Infra de teste | — | — | `register.mjs`, `resolver.mjs` | `npm test` | Node 22 |

### 4.2 Classificação das pastas

- **Críticas:** `lib/store/` (todo dado passa por ali), `lib/auth/`, `lib/supabase/`, `supabase/migrations/`, `types/`, `proxy.ts`, `app/(app)/layout.tsx`.
- **Compartilhadas:** `components/ui/`, `components/shared/`, `components/layout/`, `lib/dates.ts`, `lib/format.ts`, `lib/config.ts`, `lib/selectors.ts`, `lib/account.ts`.
- **Específicas de domínio:** `components/{clientes,processos,tasks,agenda,documentos,financeiro,dashboard,configuracoes,admin}`, `lib/services/processes/`, `lib/integrations/legal/`, `python/`.
- **Código legado / nomenclatura legada (observado):**
  - Nome **`demo-store` / `useDemoData` / `useDemoActions` / `DemoState`** — o próprio arquivo diz que os dados são reais e persistidos no Supabase. Isso sugere que o store nasceu como demonstração e foi promovido a store real sem renomear.
  - Comentários desatualizados: `app/(app)/clientes/[id]/page.tsx` e `app/(app)/processos/[id]/page.tsx` dizem "Os clientes/processos ficam salvos no navegador — o servidor não os conhece"; `components/processos/processes-view.tsx` diz "Os dados vêm do armazenamento do navegador"; `README.md` diz "Tudo o que você cadastra fica salvo no navegador" e cita o escritório "Almeida & Associados". O `ARCHITECTURE.md` (mais recente) já descreve a persistência no Supabase.
  - `ProcessMovement.kind` é descrito em `types/index.ts` como "classificação legada dos seeds"; seeds não existem mais.
  - `collectHashes` (`movements.ts`) menciona "seeds da demo".
  - Botão "Usar arquivo de exemplo" em `new-document-dialog.tsx` cria documento **sem arquivo** (resquício de demo).
- **Código duplicado (observado):**
  - `isEmail` em `lib/masks.ts` **e** `lib/auth/validation.ts` (mesma regex).
  - `cap()` (capitalizar) em `lib/dates.ts`, `lib/selectors.ts`, `components/agenda/agenda-view.tsx`.
  - Helper `call()` de `fetch` JSON em `components/admin/admin-view.tsx` e `components/configuracoes/members-manager.tsx`.
  - Lógica "concluir tarefa → logActivity com cliente derivado do processo" repetida em `toggleTask` e `moveTask` (`demo-store.tsx`).
  - Lista de papéis/permissões duplicada entre `lib/auth/permissions.ts` e `role_defaults` no SQL (intencional, protegida por teste).
  - `STATUS`/`MAX_INPUT`/parse de corpo repetidos nas duas rotas de processo.
- **Arquivos muito grandes:** ver seção 28 (`demo-store.tsx` 738 linhas, `members-manager.tsx` 535, `datajud.py` 465, `admin-view.tsx` 386, `process-profile.tsx` 365, `new-process-dialog.tsx` 361, `profile-section.tsx` 346).

---

## 5. Frontend

### 5.1 Árvore de providers (observado)

```
app/layout.tsx  (Server Component)
└── <script themeInitScript>        aplica "dark" antes da hidratação (lib/theme-script.ts)
└── <Providers>                      components/providers.tsx  ("use client")
    ├── UIProvider                   lib/store/ui-store.tsx  (diálogo aberto, Ctrl+K, sidebar)
    ├── TooltipProvider              components/ui/tooltip.tsx
    ├── {children}
    └── <Toaster>                    components/ui/sonner.tsx
        │
        ├── app/(auth)/*             telas públicas (sem sessão/dados)
        ├── app/(admin)/layout.tsx   (Server) checa super_admin → AdminView
        └── app/(app)/layout.tsx
            └── SessionProvider      lib/auth/session.tsx  → setAccount() em lib/account.ts
                └── DemoStoreProvider  lib/store/demo-store.tsx  → loadState()
                    └── AppShell     components/layout/app-shell.tsx
                        ├── Sidebar / Topbar / MobileBottomNav / MobileDrawer
                        ├── <main> children (ou "Sem acesso a este módulo")
                        ├── CommandMenu (Ctrl+K)
                        └── GlobalDialogs (novo cliente/tarefa/compromisso/documento/processo, preview)
```

**Ordem importa:** `SessionProvider` só renderiza os filhos quando a sessão está `ready` (e já chamou `setAccount`). Isso garante que `lib/account.ts` (`currentOrgId()`, `currentUserId()`) esteja preenchido antes de `DemoStoreProvider` e de qualquer tela. Se alguém usar `account.*` fora dessa árvore, `current()` lança `"Conta ainda não carregada"`.

### 5.2 Padrão das páginas

Observei que toda página em `app/(app)` segue o padrão "página fina":

```tsx
// app/(app)/clientes/page.tsx
export const metadata: Metadata = { title: "Clientes" }
export default function ClientesPage() { return <ClientsView /> }
```

Páginas dinâmicas (`clientes/[id]`, `processos/[id]`) só fazem `await params` e passam o `id` para o componente client. Nenhuma página busca dados no servidor.

### 5.3 Navegação e permissões de rota

`components/layout/nav-config.ts` é a fonte única de: itens do menu (`NAV_SECTIONS`), título/section do header (`ROUTE_META`), permissão exigida por rota (`routePermission`) e itens visíveis (`visibleSections(can)`). `AppShell` usa `routePermission(usePathname())` para trocar o conteúdo por "Sem acesso a este módulo" (proteção **visual**; os dados já não viriam por causa da RLS). `/dashboard` e `/configuracoes` não exigem permissão.

### 5.4 Diálogos globais

`useUI().openDialog(kind, defaults)` (em `lib/store/ui-store.tsx`) abre um dos diálogos montados em `components/layout/global-dialogs.tsx`. `DIALOG_PERMISSION` mapeia cada diálogo a uma permissão (`client → clients.edit`, `task → tasks.edit`, …); `GlobalDialogs` só abre se `can(...)`. Há 24 chamadas `openDialog("...")` espalhadas pelos módulos (ex.: botão "Nova tarefa" no perfil do cliente passa `{ clientId }`).

### 5.5 Design system

`components/ui/*` (24 arquivos) envolve Base UI e Tailwind: `Modal`/`ModalBody`/`ModalFooter`, `SideSheet`, `ConfirmDialog`, `DropdownMenu*`, `Popover`, `Tooltip`, `Field`/`TextInput`/`NativeSelect`/`TextArea`/`CurrencyInput`, `FilterTabs`, `UnderlineTabs`, `SearchField`, `TableShell`/`Th`/`Td`, `EmptyState`/`ErrorState`, `Skeleton*`, `StatusBadge`/`Tag`, `UserAvatar`, `AnimatedCheckbox`, `ToggleSwitch`, `ChoiceChips`, `Kbd`, `PageHeader`, `Panel`/`PanelHeader`, `FadeIn`. Tokens de cor (claro/escuro) ficam em `app/globals.css`; tema persistido em `localStorage` (`lib/theme.tsx`).

---

## 6. Backend

### 6.1 O que é "backend" no LEXA

O backend tem **três partes**:

1. **Supabase como backend de dados** (PostgREST + RLS + Storage + Auth). É acessado **diretamente do navegador** para todo o CRUD de domínio. As "regras de backend" aqui são apenas as políticas RLS e GRANTs da migração.
2. **API Routes do Next.js** (`app/api/**`), escritas como handlers simples, sem camada de service separada além de `lib/auth/members.ts`.
3. **Script Python** (`python/datajud.py`), executado como processo filho pelas rotas de processo.

Não há **Server Actions** (`"use server"` não aparece no código), não há Server Components que consultem dados de domínio (exceto `app/(admin)/layout.tsx`, que lê o papel do usuário).

### 6.2 Padrões das rotas

`lib/auth/server.ts` define:

| Helper | O que faz |
|---|---|
| `getCaller()` | `createSupabaseServer().auth.getUser()` (valida o JWT no Supabase) e lê o `profile` com a **service role** |
| `requireMember(permission?)` | exige perfil não-super-admin, com `organization_id`, perfil ativo, escritório `active`, e (opcional) a permissão; devolve `{ user, profile, organizationId }` |
| `requireSuperAdmin()` | exige `role === "super_admin"` e ativo |
| `authorize(permission?)` | versão de `requireMember` que devolve `Response` de erro (para as rotas de processo, que fazem streaming) |
| `route(handler)` | wrapper: `HttpError` → JSON com status; qualquer outro erro → 500 genérico + `console.error` |
| `readJson<T>()` | `request.json()` com erro 400 se inválido (sem validação de schema — só *cast*) |
| `siteUrl(request)` | `NEXT_PUBLIC_SITE_URL` ou origem da requisição |

Duas famílias de rotas:
- **`route()`-wrapped** (auth, team, admin, me): respostas `{ error: string }`.
- **Processos** (`search`, `[id]/sync`): sem `route()`, com respostas `{ error: { code, message, detail? } }` — formato diferente, consumido por `lib/services/processes/client.ts`.

### 6.3 Três clientes Supabase

| Arquivo | Chave | Sujeito à RLS? | Onde pode rodar |
|---|---|---|---|
| `lib/supabase/client.ts` → `getSupabase()` | anon + cookie | Sim | Navegador (singleton) |
| `lib/supabase/server.ts` → `createSupabaseServer()` | anon + cookie (via `next/headers`) | Sim | Servidor (rotas, layouts) |
| `lib/supabase/admin.ts` → `getSupabaseAdmin()` | **service role** | **Não** (ignora RLS) | Só servidor; lança erro se `window` existe |

---

## 7. Banco de dados

Fonte: `supabase/migrations/0001_lexa_auth.sql` (único arquivo de migração; o comentário diz para rodar **uma vez, no SQL Editor, projeto vazio**).

### 7.1 Tabelas relacionais

#### `public.organizations`
- **Responsabilidade:** o escritório (tenant).
- **Campos:** `id uuid PK default gen_random_uuid()`, `name text not null`, `legal_name`, `cnpj`, `city`, `address`, `phone`, `email` (text, opcionais), `plan text not null default 'Essencial' check in ('Essencial','Profissional','Escritório')`, `status text not null default 'pending' check in ('pending','active','inactive')`, `created_at timestamptz default now()`, `approved_at timestamptz`.
- **Tenant:** é o próprio tenant.
- **Índices:** só a PK.
- **RLS:** `organizations_select` (`id = my_org_id()` — vê o próprio escritório em qualquer status); `organizations_update` (`id = current_org_id() and has_perm('office.manage')`).
- **GRANT:** `authenticated` só pode `UPDATE (name, legal_name, cnpj, city, address, phone, email)`. `plan`, `status`, `approved_at` só pela service role. Sem `INSERT/DELETE` pelo navegador.
- **Atualizado em:** não há `updated_at`.
- **Soft delete:** não (há `status = inactive`, que funciona como bloqueio).

#### `public.profiles`
- **Responsabilidade:** a pessoa dentro do LEXA (1:1 com `auth.users`).
- **Campos:** `id uuid PK references auth.users(id) on delete cascade`, `organization_id uuid references organizations(id) on delete cascade` (nulo só para super admin), `role text not null check in ('super_admin','owner','lawyer','staff')`, `permissions text[]` (null = padrão do papel), `name text not null`, `email text not null`, `phone`, `job_title`, `oab`, `avatar_url`, `active boolean not null default true`, `created_at`.
- **Constraint:** `profiles_org_matches_role check ((role = 'super_admin') = (organization_id is null))`.
- **Índice:** `profiles_organization_id_idx`.
- **RLS:** `profiles_select` (`id = auth.uid() or organization_id = current_org_id()`); `profiles_update_self` (`id = auth.uid() and active`).
- **GRANT:** `authenticated` só pode `UPDATE (name, phone, job_title, oab, avatar_url)`. Papel, permissões, `active`, e-mail: só service role.
- **Unicidade de e-mail:** não há `unique` em `profiles.email`; a unicidade vem do `auth.users` do Supabase.

### 7.2 Tabelas de dados (formato documento)

Criadas em laço (`do $$ … loop`) com **formato idêntico**:

```sql
create table public.<tbl> (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);
-- trigger <tbl>_touch → touch_updated_at()
-- RLS habilitada; revoke all from anon
```

| Tabela | Módulo de permissão | Políticas | Entidade TS em `data` |
|---|---|---|---|
| `clients` | `clients` | select `.view`; insert/update/delete `.edit` | `Client` |
| `processes` | `processes` | idem | `Process` (inclui `movements[]`, `parties`, `source`, `raw` de cada movimento) |
| `tasks` | `tasks` | idem | `Task` |
| `task_columns` | `tasks` | idem | `TaskColumn` |
| `appointments` | `agenda` | idem | `Appointment` |
| `appointment_categories` | `agenda` | idem | `AppointmentCategory` |
| `documents` | `documents` | idem | `LegalDocument` (metadados) |
| `invoices` | `finance` | idem | `Invoice` |
| `activities` | — | select/insert: qualquer membro do escritório ativo; **sem update/delete** | `Activity` |
| `notifications` | — | select/insert: qualquer membro; update: qualquer membro (`notifications_update`); sem delete | `Notification` |

Características importantes (observadas):
- **PK composta `(organization_id, id)`**; `id` é **texto gerado no navegador** (`uid(prefix)` → `"c_<uuid>"`, `"p_<uuid>"` …, em `lib/format.ts`).
- **Nenhum índice** além da PK. **Nenhuma constraint** sobre o conteúdo de `data` (nem `check`, nem JSON Schema). Nenhuma unicidade de CPF/CNPJ ou CNJ.
- `created_at`/`updated_at` existem **na linha**, mas a UI usa `data.createdAt` (gerado no navegador). `loadCollection` ordena a query por `created_at` e depois reordena em memória por `data.createdAt ?? data.at` (`orderCollection`).
- **Soft delete:** não existe em nenhuma tabela.
- O campo `data.organizationId` (JSON) é redundante com a coluna `organization_id`; o banco **não** confere se batem (só a coluna é usada pela RLS).

### 7.3 Funções SQL

| Função | Tipo | Retorno | Papel |
|---|---|---|---|
| `role_defaults(p_role)` | `immutable` | `text[]` | permissões padrão por papel (deve bater com `ROLE_DEFAULTS` em TS — há teste) |
| `current_org_id()` | `stable security definer` | `uuid` | escritório do `auth.uid()` **somente se** perfil ativo e escritório `active` |
| `has_perm(p_perm)` | `stable security definer` | `boolean` | `owner` → sempre true; senão `p_perm = any(coalesce(permissions, role_defaults(role)))`, com perfil/escritório ativos |
| `my_org_id()` | `stable security definer` | `uuid` | escritório do perfil em qualquer status (para mostrar "aguardando aprovação") |
| `touch_updated_at()` | trigger | — | `new.updated_at = now()` |

`execute` das três funções de autorização é revogado de `anon`.

### 7.4 Storage

| Bucket | Público? | Limite | Políticas |
|---|---|---|---|
| `avatars` | **Sim** | 5 MB | insert/select/delete só na pasta `<auth.uid()>/…` |
| `documents` | Não | 25 MB (`26214400`) | select exige pasta = `current_org_id()` e `documents.view`; insert/delete exigem `documents.edit`. **Não há política de UPDATE** (sobrescrever arquivo não é permitido). |

### 7.5 Cache local (fora do Postgres)

`python/datajud.py` → `SQLiteCache` cria `process_cache(cnj TEXT PK, tribunal TEXT, response_json TEXT, updated_at INTEGER)` em `.data/datajud_cache.db` (caminho relativo à raiz do projeto; `.data/` está no `.gitignore`). **Compartilhado por todos os escritórios** (chave é só o CNJ).

### 7.6 Diagrama de relacionamento (real)

Legenda: `══FK══` chave estrangeira real no banco; `┄┄id┄┄` referência lógica dentro de `data jsonb` (não validada pelo banco).

```
auth.users ══1:1 (cascade)══ profiles
                                │
organizations ══1:N (cascade)═══╡ profiles.organization_id   (null = super_admin)
      │
      ╞══1:N (cascade)══ clients ─────────────┐
      │                    ▲  ▲  ▲  ▲         │ Client.ownerId ┄┄id┄┄► profiles
      │                    ┊  ┊  ┊  ┊         │
      ╞══1:N══ processes ┄┄clientId (opcional: "" = "Sem cliente")
      │          │  └─ movements[] (EMBUTIDO no jsonb do processo, não é tabela)
      │          │  └─ parties {active[],passive[],others[]}, source{…}
      │          │  Process.ownerId ┄┄► profiles
      │          ▲
      ╞══1:N══ tasks ┄┄ related = {type:"client"|"process", id}   (polimórfico)
      │          ┄┄ assigneeId ┄┄► profiles ;  columnId ┄┄► task_columns
      ╞══1:N══ task_columns
      ╞══1:N══ appointments ┄┄ clientId?, processId?, categoryId? ┄┄► appointment_categories
      │                        ownerId ┄┄► profiles
      ╞══1:N══ appointment_categories
      ╞══1:N══ documents ┄┄ clientId?, processId?, uploadedById ┄┄► profiles
      │                     storagePath ┄┄► storage.objects (bucket documents/<org_id>/…)
      ╞══1:N══ invoices ┄┄ clientId (obrigatório no tipo), processId?
      ╞══1:N══ activities ┄┄ clientId?, processId?, actorUserId?
      └══1:N══ notifications (só href; sem vínculos por id)
```

---

## 8. Autenticação

### 8.1 Componentes

| Peça | Arquivo | Papel |
|---|---|---|
| Login | `components/auth/login-form.tsx` | `getSupabase().auth.signInWithPassword()` no navegador → `hardNavigate(safeNext(next))` |
| Cadastro | `components/auth/signup-form.tsx` → `POST /api/auth/signup` | cria escritório `pending`, usuário (`email_confirm: true`) e perfil `owner`; depois faz login no navegador |
| Recuperação | `components/auth/recover-form.tsx` → `POST /api/auth/recover` | gera link de recuperação (resposta sempre `ok`) |
| Confirmação de link | `app/auth/confirm/route.ts` | `verifyOtp({ token_hash, type })` → sessão em cookie → redireciona para `/redefinir-senha` |
| Nova senha | `components/auth/reset-password-form.tsx` | `auth.updateUser({ password })` no navegador |
| Sessão no servidor | `proxy.ts` | renova cookies e bloqueia não logados |
| Sessão no app | `lib/auth/session.tsx` (`SessionProvider`) | carrega perfil, escritório e membros; telas de "aguardando aprovação"/"acesso desativado" |
| Logout | `signOut()` em `session.tsx` | `auth.signOut()` + `hardNavigate("/login")`; também ouve `onAuthStateChange("SIGNED_OUT")` |
| Super Admin | `instrumentation.ts` → `lib/auth/bootstrap.ts` | cria conta/perfil do super admin a partir de `LEXA_SUPERADMIN_EMAIL/PASSWORD` no start |
| Trocar senha (logado) | `profile-section.tsx` | revalida senha atual com `signInWithPassword` e chama `updateUser` |
| Trocar e-mail | `PATCH /api/me/email` | confere senha com um cliente Supabase descartável e usa service role |
| Encerrar outras sessões | `profile-section.tsx` | `auth.signOut({ scope: "others" })` |

### 8.2 Onde a sessão mora

Observei que a sessão é a do Supabase Auth, persistida em **cookies** por `@supabase/ssr` (`createBrowserClient` no navegador, `createServerClient` no servidor/proxy). Não há `localStorage` de sessão no código do LEXA. Os atributos exatos dos cookies (SameSite, HttpOnly) **não são definidos no código do LEXA**; ficam com os padrões da biblioteca — não foi possível confirmar sem `node_modules`.

### 8.3 Fluxo de login

```
/login (LoginForm)
  │ email+senha
  ▼
getSupabase().auth.signInWithPassword()         ← navegador → Supabase Auth
  │ ok → cookies de sessão gravados pelo @supabase/ssr
  ▼
hardNavigate(safeNext(?next))                   ← recarga completa (lib/auth/navigate.ts)
  ▼
proxy.ts (toda requisição que casa com o matcher)
  ├─ createServerClient(anon, cookies)
  ├─ supabase.auth.getUser()                    ← valida o token no Supabase
  ├─ sem user e rota não pública → /login?next=… (ou 401 JSON em /api/*)
  └─ com user em /login|/cadastro|/recuperar-senha → redirect "/"
  ▼
"/" → redirect("/dashboard")  (app/page.tsx)
  ▼
app/(app)/layout.tsx → SessionProvider.loadSession()
  ├─ auth.getUser()
  ├─ profiles.select(*).eq(id)            (RLS: o próprio perfil)
  ├─ super_admin → hardNavigate("/admin")
  ├─ !active → tela "Acesso desativado"
  ├─ organizations.select(*).eq(id)       (RLS: my_org_id)
  ├─ pending → "Aguardando aprovação" ; inactive → "Acesso desativado"
  ├─ profiles.select(*).eq(organization_id).order(name)   (membros)
  └─ setAccount({ user, organization, members }) → status "ready"
  ▼
DemoStoreProvider → loadState() → telas
```

Rotas públicas (`proxy.ts` → `PUBLIC`): `/login`, `/cadastro`, `/recuperar-senha`, `/auth/confirm`, `/api/auth/*`. **`/redefinir-senha` não é pública** — funciona porque `/auth/confirm` já criou a sessão antes.

**Falha fechada:** sem `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, o proxy responde 503 para tudo que não é público.

### 8.4 Recuperação de senha e convite

```
/recuperar-senha → POST /api/auth/recover {email}
  → admin.auth.admin.generateLink({type:"recovery"})
  → link = siteUrl + /auth/confirm?token_hash=…&type=recovery&next=/redefinir-senha
  → sendAuthLink() → console.info (lib/auth/mailer.ts)   ← NÃO envia e-mail
  → resposta sempre {ok:true} (não revela se o e-mail existe)

Convite (Sócio ou Super Admin) → inviteMember() (lib/auth/members.ts)
  → admin.auth.admin.createUser({email_confirm:true})
  → profiles.insert(...)  (rollback: deleteUser se falhar)
  → generateLink({type:"recovery"}) → next=/redefinir-senha?convite=1
  → sendAuthLink() → console.info
```

---

## 9. Autorização

### 9.1 Modelo

- **Papéis** (`lib/auth/permissions.ts` → `Role`): `super_admin` (sem escritório; não acessa dados jurídicos), `owner` (Sócio/Proprietário — tudo, sempre), `lawyer` (Advogado), `staff` (Colaborador/Estagiário).
- **Permissões** (`Permission`): `${módulo}.view|edit` para `clients, processes, tasks, agenda, documents, finance` + `office.manage`, `users.manage`.
- **Padrões:** `owner` = todas; `lawyer` = trabalho (view/edit de clientes, processos, tarefas, agenda, documentos) + `finance.view`; `staff` = trabalho, sem financeiro.
- **Personalização:** `profiles.permissions text[]` substitui o padrão do papel (exceto `owner`, que sempre tem tudo). Editada só por `PATCH /api/team/users/[id]` (ou rota admin), com `sanitizePermissions`.

### 9.2 Onde as permissões são verificadas

| Camada | Mecanismo | É segurança? |
|---|---|---|
| **Banco (RLS)** | `has_perm('<módulo>.view')` para SELECT e `.edit` para INSERT/UPDATE/DELETE nas 8 tabelas de módulo; `has_perm('office.manage')` no UPDATE de `organizations` | **Sim** — é a barreira real para o CRUD |
| **Storage** | políticas do bucket `documents` com `has_perm('documents.view'|'documents.edit')` + pasta do escritório | **Sim** |
| **GRANT por coluna** | `profiles`/`organizations`: navegador não altera papel, permissões, status, plano, e-mail, `active` | **Sim** |
| **API Routes** | `requireMember("users.manage")` (team), `requireSuperAdmin()` (admin), `authorize("processes.edit")` (DataJud), `requireMember()` (me/email) | **Sim** |
| **Layout do admin** | `app/(admin)/layout.tsx` checa `role === "super_admin"` no servidor antes de renderizar | Sim (e as rotas admin checam de novo) |
| **Regras de gestão** | `members.ts`: `targetIn()` (alvo pertence ao escritório), não alterar o próprio papel/permissões/status, manter ≥1 `owner` ativo, não remover a si mesmo | Sim |
| **Frontend** | `useSession().can()`, `<Can>`, `routePermission` no `AppShell`, `visibleSections` no menu, `DIALOG_PERMISSION` nos diálogos, abas de configurações | **Não** — apenas UX |

### 9.3 Lacunas de autorização observadas

- **`activities` e `notifications` não exigem permissão de módulo** (só pertencer ao escritório). As mensagens de atividade contêm nomes de clientes, códigos de processo e nomes de documentos (`logActivity` em `demo-store.tsx`). **Potencial risco:** um usuário com permissões customizadas sem `clients.view` ainda vê nomes de clientes no "Atividade recente" do Dashboard (`components/dashboard/recent-activity.tsx`), que é exibido sem checagem de permissão em `dashboard-view.tsx`.
- **`notifications_update`** permite a qualquer membro reescrever o `data` inteiro de qualquer notificação do escritório (não só marcar `read`). Baixo impacto hoje, pois nada cria notificações.
- **Rotas do DataJud** exigem `processes.edit`, mas **não** verificam se o `id` do processo pertence ao escritório — o `id` só é usado para log. Isso sugere que a rota é propositalmente "sem estado" (o comentário diz que o `id` é "para o dia em que a persistência sair do browser").

---

## 10. Multi-tenant

### 10.1 É realmente multi-tenant? **Sim.**

Observei que o tenant é `organizations.id`, e o vínculo usuário→tenant é `profiles.organization_id`. Cada pessoa pertence a **um** escritório (convite de e-mail já existente falha com 409 "Cada pessoa pertence a um escritório").

### 10.2 Como o tenant é identificado

- **No banco:** `current_org_id()` deriva o escritório de `auth.uid()` (JWT). **O cliente nunca informa o tenant para leitura**: `loadCollection` faz `select("data")` sem filtro e a RLS devolve só as linhas do escritório.
- **Na escrita:** `syncState(supabase, account.currentOrgId(), diff)` envia `organization_id` explicitamente, e a política `with check (organization_id = current_org_id() and has_perm(...))` rejeita qualquer outro valor.
- **Nas rotas:** `requireMember()` devolve `organizationId` do perfil (lido pela service role) — nunca do corpo da requisição. Rotas admin recebem o `id` da URL, mas só o super admin passa.

### 10.3 "Como o sistema impede que o escritório A veja dados do escritório B?"

| Entidade | Leitura | Escrita | Avaliação |
|---|---|---|---|
| clients, processes, tasks, task_columns, appointments, appointment_categories, documents (metadados), invoices | RLS `organization_id = current_org_id()` | RLS `with check` idem | **Protegido no banco** |
| activities, notifications | RLS idem | insert idem; notifications update idem | Protegido entre tenants (mas sem permissão de módulo) |
| Arquivos de documentos | Storage: 1º segmento do caminho = `current_org_id()` | idem | **Protegido**. Mesmo que alguém grave em `data.storagePath` um caminho de outro escritório, `createSignedUrl` é negado pela política |
| profiles | `id = auth.uid() or organization_id = current_org_id()` | só colunas próprias do próprio perfil | Protegido |
| organizations | `id = my_org_id()` | `office.manage` + colunas liberadas | Protegido |
| Avatares | bucket **público** | só a própria pasta | Leitura pública por URL (intencional) |
| Cache DataJud (SQLite) | compartilhado entre tenants | — | Contém só dados públicos do DataJud; não é dado do escritório. Isso sugere risco baixo |
| Rotas `/api/team/*` | `organizationId` do chamador + `targetIn()` | idem | Protegido |
| Rotas `/api/admin/*` | só super admin | — | Protegido |

**Conclusão:** não encontrei caminho de acesso *cross-tenant* no código analisado. Os pontos fracos são **intra-tenant** (seção 9.3) e de **integridade** (qualquer membro com `.edit` pode gravar JSON arbitrário no próprio escritório, pulando todas as validações da UI — seção 25).

**Não foi possível determinar pelo código analisado:** se o projeto Supabase de produção tem os *default privileges* padrão (GRANT de `select/insert/update/delete` para `authenticated` nas tabelas novas do schema `public`). A migração **não concede** explicitamente esses privilégios nas tabelas de dados — ela só revoga de `anon`. Isso sugere dependência do comportamento padrão do Supabase.

---

## 11. Clientes

### 11.1 Arquivos

| Arquivo | Papel |
|---|---|
| `app/(app)/clientes/page.tsx` | Página → `<ClientsView />` |
| `app/(app)/clientes/[id]/page.tsx` | Página → `<ClientProfile id />` (em `<Suspense>`, pois usa `useSearchParams`) |
| `components/clientes/clients-view.tsx` | Listagem, filtros, busca, ordenação, exclusão |
| `components/clientes/new-client-dialog.tsx` | Formulário "Novo cliente" (diálogo global `"client"`) |
| `components/clientes/profile/client-profile.tsx` | Perfil com abas (`?tab=`) |
| `components/clientes/profile/client-header.tsx` | Cabeçalho: status, tags, botões Editar/Nova tarefa/Novo documento/Excluir |
| `components/clientes/profile/overview-tab.tsx` | Aba "Visão geral": mini-stats, informações, contato, compromissos, tarefas, atividade |
| `components/clientes/profile/finance-tab.tsx` | Aba "Financeiro": faturas do cliente (`clientFinance`) |
| `components/clientes/profile/edit-client-dialog.tsx` | Edição parcial (telefone, e-mail, endereço, responsável) |
| `components/clientes/source-icon.tsx` | Ícone da origem do cliente (`WhatsApp`, `Instagram`…) |
| `lib/store/demo-store.tsx` | `addClient`, `updateClient`, `deleteClient` |
| `lib/selectors.ts` | `findClient`, `clientFinance`, `describeRelated` |

### 11.2 Listagem, busca e filtros (`ClientsView`)

Observei que:
- Os dados vêm de `useDemoData().clients` (já carregados do Supabase).
- **Filtro por status** (`FILTERS`: todos/ativo/inativo/novo/inadimplente) com contagem por status calculada no render.
- **Busca** textual via `matches(query, name, area, email, document, phone)` (`lib/format.ts`, sem acento/caixa).
- **Ordenação** por nome (`localeCompare pt-BR`) ou `lastActivityAt`.
- Coluna "Processos": contagem de processos **não concluídos** por `clientId` (`processCount`, `useMemo`).
- Até `hydrated`, mostra `SkeletonTable`.
- Mobile: lista de cartões com `<Link>`.

### 11.3 Criação — fluxo "Novo cliente" (arquivo → função → serviço → banco)

```
[Botão "Novo cliente"]  components/clientes/clients-view.tsx  (dentro de <Can permission="clients.edit">)
   │ onClick → useUI().openDialog("client")                         lib/store/ui-store.tsx
   ▼
GlobalDialogs  components/layout/global-dialogs.tsx
   │ isOpen("client") = dialog.kind==="client" && can("clients.edit")
   ▼
NewClientDialog → NewClientForm  components/clientes/new-client-dialog.tsx
   │ estado local (useState): name, kind, document, email, phone, address, area, ownerId
   │ máscaras: maskDocument / maskPhone (lib/masks.ts)
   │ submit():
   │   • nome ≥ 3 caracteres
   │   • documento com 11 (PF) ou 14 (PJ) dígitos           ← só contagem, SEM dígito verificador
   │   • duplicidade: clients.some(c => dígitos(c.document) === dígitos)   ← só no array em memória
   │   • e-mail (se preenchido) via isEmail (lib/masks.ts)
   ▼
useDemoActions().addClient(input)  lib/store/demo-store.tsx
   │ client = { organizationId: currentOrgId(), createdAt: nowISO(), ...input,
   │            id: uid("c"), status: "novo", clientSince: hoje, lastActivityAt: agora }
   │ commit(s => ({ ...s, clients: [client, ...s.clients],
   │                activities: [logActivity({type:"client", ...}), ...s.activities] }))
   │   → stateRef.current = next; setState(next)   (UI atualiza na hora — otimista)
   ▼
toast.success("Cliente cadastrado.")  (antes de gravar no banco)
   ▼
useEffect([state]) → setTimeout(persist, 300)   (debounce)
   ▼
persist()  demo-store.tsx
   │ diff = diffState(savedRef.current, persisted(stateRef.current))   lib/store/storage.ts
   │   → { clients: {upserts:[client]}, activities: {upserts:[activity]} }
   │ savedRef.current = next   (marca como salvo ANTES da confirmação)
   │ queueRef = queueRef.then(() => syncState(supabase, orgId, diff))
   ▼
syncState  lib/store/storage.ts
   │ supabase.from("clients").upsert([{organization_id, id, data: client}],
   │                                  {onConflict: "organization_id,id"})
   │ supabase.from("activities").upsert([...], {ignoreDuplicates: true})
   ▼
Supabase PostgREST → RLS clients_insert:
   organization_id = current_org_id() AND has_perm('clients.edit')
   ▼
public.clients (linha nova, data jsonb = Client)
   │
   └─ Se RLS negar ou rede falhar → toast.error(...) + replaceWithServer(await loadState())
```

### 11.4 Edição

`EditClientDialog` edita **apenas** `phone`, `email`, `address`, `ownerId` → `updateClient(id, patch)` (merge raso) → mesmo caminho de persistência. **Não há validação** no formulário de edição (e-mail inválido é aceito). Nome, documento, área, tipo PF/PJ, status, origem (`source`), contato, profissão e data de nascimento **não têm tela de edição**.

### 11.5 Exclusão

`deleteClient(id)` remove do array `clients` e registra atividade. **Não há cascata**: processos, tarefas, compromissos, documentos e faturas mantêm `clientId` apontando para um cliente inexistente. A UI trata isso mostrando "Sem cliente" ou omitindo o nome (`clientName()` retorna `""`, `describeRelated` retorna `undefined`). O `ConfirmDialog` avisa: "Processos, documentos e tarefas vinculados a este cliente deixam de mostrar o nome dele."

### 11.6 Página individual (`ClientProfile`)

- Busca o cliente em `data.clients.find(id)`. Se `hydrated` e não achou → "Cliente não encontrado". Antes de `hydrated` → esqueleto.
- Abas controladas por URL (`?tab=visao-geral|processos|documentos|financeiro|timeline`); a aba "financeiro" só aparece com `finance.view`.
- **Relacionamentos derivados no render** (todos filtros em memória):
  - Processos: `data.processes.filter(p => p.clientId === id)`.
  - Tarefas: `related.type==="client" && id` **ou** `related.type==="process"` de um processo do cliente (`overview-tab.tsx`).
  - Documentos: `data.documents.filter(d => d.clientId === id)`.
  - Financeiro: `clientFinance(data, id)` → faturas do cliente (pago, em aberto, vencido).
  - Agenda: `appointments.filter(a => a.clientId === id && end > agora)` (4 próximos).
  - Timeline: `data.activities.filter(a => a.clientId === id)` via `ActivityTimeline`.
- Botões simulados: "Enviar cobrança" (`finance-tab.tsx`) apenas mostra toast "Link de pagamento enviado".

### 11.7 Validação de CPF — o que existe de fato

Observei que **não há validação de dígito verificador de CPF/CNPJ** em lugar nenhum. A única regra é o número de dígitos (11 ou 14) no `NewClientForm`. O campo é armazenado **com máscara** (`document: form.document`).

### 11.8 Prevenção de duplicidade

Somente no frontend (`clients.some(...)` no array carregado). **Potencial risco:** dois usuários cadastrando o mesmo CPF ao mesmo tempo, um usuário com a lista desatualizada (não há realtime) ou uma gravação direta via PostgREST criam duplicatas — o banco não tem unicidade sobre `data->>'document'`.

### 11.9 Estado

Local: filtro, busca, ordenação, cliente a excluir (`useState`). Aba: URL. Dados: store global.

### 11.10 Campos que nunca mudam (observado)

- `status` nasce `"novo"` e **nenhum código altera** (não há ação nem tela) — portanto os filtros "Ativos", "Inativos", "Inadimplente" só teriam itens se o banco fosse alterado por fora.
- `lastActivityAt` só é definido na criação — a ordenação "Última atividade" equivale a "data de criação".

---

## 12. Processos

### 12.1 Arquivos

| Arquivo | Papel |
|---|---|
| `components/processos/processes-view.tsx` | Listagem, filtros, busca, exclusão |
| `components/processos/new-process-dialog.tsx` | Formulário com consulta CNJ ao vivo ("Preencher") e cadastro manual |
| `components/processos/lookup-log.tsx` | Log ao vivo da consulta (`LookupLog`, `useElapsed`, `makeLogAppender`) |
| `components/processos/process-profile.tsx` | Página do processo |
| `components/processos/process-source-panel.tsx` | Painéis "Andamento" (botão Atualizar), "Resumo", "Partes" |
| `components/processos/process-timeline.tsx` | Timeline de movimentações com filtros e paginação |
| `components/processos/movement-detail-sheet.tsx` | Detalhe de uma movimentação (inclui JSON bruto) |
| `components/processos/deadline-label.tsx` | Rótulo de prazo |
| `components/shared/process-list-item.tsx` | Cartão de processo (usado no perfil do cliente) |
| `lib/store/demo-store.tsx` | `addProcess`, `updateProcess`, `importProcess`, `applyProcessSync`, `deleteProcess` |
| `lib/services/processes/*` | pipeline (ver seções 13 e 14) |
| `app/api/processes/search/route.ts`, `app/api/processes/[id]/sync/route.ts` | servidor |

### 12.2 Listagem e filtros

`ProcessesView`: filtros `todos`, `prazos` (próximo prazo em ≤ 7 dias), e por `status` interno; abas com contagem zero são ocultadas. Busca por número, código, tipo, área, nome do cliente, parte contrária. Ordenação: não concluídos primeiro, depois por `nextDeadline.date`.

**Observação importante:** `nextDeadline` **nunca é preenchido por nenhum código** (verifiquei todas as atribuições). Consequências: o filtro "Prazos da semana" fica sempre com 0 e oculto; a coluna "Próximo prazo" mostra "—"; no perfil aparece "Sem prazos"; o mini-stat "Próximo prazo" do cliente mostra "Nenhum prazo em aberto".

### 12.3 Criação

Dois caminhos no mesmo formulário (`ProcessForm`):

1. **Manual** ("Cadastrar processo"): valida 20 dígitos (sem checar DV no submit), tipo ≥ 3 caracteres, e duplicidade por CNJ **no array em memória** (`findByCnj`). Chama `addProcess()`, que cria `code` sequencial (`nextProcessCode`: maior número existente + 1, a partir de `#103000`), `distributedAt = hoje`, `lastMovementAt = agora` e uma movimentação inicial "Processo cadastrado" (`kind: "distribution"`).
2. **Consulta CNJ** ("Preencher"): ver 12.8. **O processo é salvo imediatamente ao fim da consulta**, antes de o usuário clicar em salvar. O botão de salvar depois só grava ajustes via `updateProcess`.

### 12.4 Edição

`updateProcess(id, patch)` só é chamado pelo `new-process-dialog` (quando o CNJ consultado já está vinculado). **Não há tela de edição no perfil do processo** — status, responsável, valor da causa etc. só podem ser ajustados reabrindo "Novo processo" e consultando o mesmo CNJ.

### 12.5 Exclusão

`deleteProcess(id)` remove o processo (e, com ele, todas as movimentações embutidas) e registra atividade. Tarefas (`related.process`), compromissos, documentos e faturas vinculados ficam órfãos.

### 12.6 Detalhes (`ProcessProfile`)

Deriva no render: cliente (`find`), responsável (`getUser`), tarefas do processo, documentos, compromissos futuros, `interpretMovements(process.movements, process.id)` (memoizado por identidade do array em um `WeakMap`). Painéis: prazo, responsável (OAB ou cargo), última movimentação, valor da causa, timeline, andamento/sincronização, resumo da fonte, tarefas, agenda, partes, detalhes, documentos.

### 12.7 Relações

- **Cliente relacionado:** `process.clientId` (opcional; `""` = "Sem cliente").
- **Responsável:** `process.ownerId` → `getUser()` (membro ou "Usuário removido").
- **Tarefas:** `task.related = {type:"process", id}`.
- **Prazos:** campo `nextDeadline` (não preenchido — ver 12.2).
- **Partes:** `process.parties` vem da fonte (a API pública do DataJud normalmente não traz partes; a UI explica isso).

### 12.8 Fluxo completo "CNJ informado → UI" (implementação real)

```
NewProcessDialog / ProcessForm (new-process-dialog.tsx)
 │ digitação → maskCNJ (lib/cnj.ts)
 │ "Preencher" → autofill():
 │   • 20 dígitos? • hasValidCheckDigits (MOD 97-10)  ← número impossível nem sai do navegador
 │   • AbortController (fechar o modal cancela)
 ▼
searchProcessByCNJ(cnj, onEvent, signal)  lib/services/processes/client.ts
 │ fetch POST /api/processes/search {cnj}   (cookie de sessão)
 ▼
proxy.ts (usuário logado?) → route.ts
 │ authorize("processes.edit")  → requireMember (service role lê perfil/escritório)
 │ valida: string, ≤ 32 caracteres
 │ ReadableStream NDJSON
 ▼
runPythonLookup(cnj, {signal})  lib/services/processes/python-lookup.ts
 │ spawn(python3, [python/datajud.py, cnj, "--events"])   (sem shell)
 │ timeout duro: DATAJUD_PYTHON_TIMEOUT_MS (padrão 5 min); abort mata o processo
 ▼
datajud.py lookup()
 │ cnj_digits (20 dígitos + DV) → tribunal_for (J.TR → sigla) → alias api_publica_<sigla>
 │ cache SQLite (6h) — se hit: evento cache_hit + result
 │ DataJudClient.search: POST {BASE_URL}/{alias}/_search {"query":{"match":{"numeroProcesso":…}}}
 │   eventos: request, response, rate_limited, partial, server_error, network_error
 │ sucesso com hits → grava cache → linha {"type":"result", found, response}
 ▼
route.ts: para cada linha
 │ event → console.info + repassa ao navegador
 │ error → userMessageFor(code) + detail
 │ result → mapSearchResponse(response, cnj)   (mapper.ts: JSON bruto → ExternalProcess)
 │        → buildProcessSheet(external)        (sheet.ts: → ProcessSheet, datas ISO local, hash por movimento)
 │        → {"type":"result", found, sheet, cached, fetchedAt}
 ▼
client.ts lê o stream linha a linha → onEvent(evento) → LookupLog na tela
 │ resultado final: {ok:true, sheet} | {ok:false, code, message}
 ▼
ProcessForm
 │ existe processo com esse CNJ no store?
 │   sim → applyProcessSync(existing.id, sheet)  → só movimentações novas (hash)
 │   não → importProcess(sheet, meta)            → buildProcessDraft (import.ts) + id/code
 ▼
demo-store: commit(...) → processes[...] (+ activity) → persist (300 ms) → syncState
 ▼
Supabase: upsert em public.processes (data = Process com movements[] + raw) — RLS processes_insert/update
 ▼
UI: toast "Processo salvo em Processos" → /processos/[id] → interpretMovements → buildTimeline → ProcessTimeline
```

### 12.9 Normalização e armazenamento

- **Onde normaliza:** no servidor (`mapper.ts`, `sheet.ts`), antes de enviar ao navegador. O navegador recebe `ProcessSheet` (nunca o JSON bruto inteiro — mas **cada movimento carrega seu `raw`**).
- **Onde converte para o modelo interno:** no navegador (`import.ts` → `buildProcessDraft`, `toProcessMovements`).
- **Onde armazena:** dentro do JSON do processo (`processes.data.movements[]`). Não há tabela de movimentações.
- **Cache:** SQLite no servidor (6 h, só acertos); não há cache no navegador além do store em memória.
- **Erros:** códigos compartilhados Python↔TS (`INVALID_CNJ`, `UNSUPPORTED_COURT`, `PROVIDER_NOT_CONFIGURED`, `AUTHENTICATION`, `NOT_FOUND`, `RATE_LIMIT`, `TIMEOUT`, `UNAVAILABLE`, `UNEXPECTED`) + `OFFLINE`/`ABORTED` criados no cliente. Mensagens em `lib/integrations/legal/datajud/errors.ts`; títulos em `lookupErrorTitle()` no formulário.

### 12.10 Sincronização (botão "Atualizar")

`ProcessSyncPanel` → `syncProcessById(process.id, process.cnj ?? process.number)` → `POST /api/processes/[id]/sync` (sem streaming; `--refresh` ignora o cache e o atualiza) → JSON `{ sheet }` → `applyProcessSync(process.id, sheet)`:
- calcula `collectHashes(cnj, current.movements)` (hash gravado ou recalculado para movimentos antigos);
- `diffMovements` → só os novos recebem `id` e entram;
- reordena por data desc; atualiza `lastMovementAt`, `lastSyncedAt`, campos da fonte **sem apagar** o que existia (`sheet.x ?? current.x`), partes só se a fonte trouxe alguma;
- registra atividade **somente se houve novidade**.

Para processo **manual sem CNJ válido**, a rota recebe `process.number` (que pode estar formatado ou incompleto) e o Python rejeita com `INVALID_CNJ`.

---

## 13. Movimentações

### 13.1 Modelo

`ProcessMovement` (`types/index.ts`): `id`, `at` (ISO local), `title` (nome da fonte), `description?`, `kind?` (legado), `code?` (TPU/CNJ), `hash?`, `origin?` (`manual|datajud`), `complements?`, `judicialUnit?`, `document?`, `raw?` (objeto original da fonte).

### 13.2 Pipeline de dados

```
DataJud _source.movimentos[]                      (JSON bruto)
  │ mapper.ts → mapMovements()
  │   • descarta movimento sem dataHora válida
  │   • complementos: descricao→key (técnico), nome→name (legível)   ← inversão documentada
  │   • description = nomes legíveis unidos por " · "
  │   • raw preservado
  ▼
ExternalMovement  (lib/integrations/legal/types.ts)
  │ sheet.ts → buildProcessSheet()
  │   • occurredAt → toLocal() (lê componentes literais, SEM conversão de fuso)
  │   • hash = externalMovementHash(cnj, movement)  (movements.ts: FNV-1a duplo sobre
  │           cnj|code|minuto|nome normalizado|descrição normalizada)
  ▼
SheetMovement
  │ import.ts → toProcessMovements()   (sem classificar)
  ▼
ProcessMovement (sem id) → store adiciona id = uid("m") → gravado dentro de processes.data
  │
  │ (na exibição)
  ▼
movement-interpreter.ts → interpretMovements()  → LexaMovement
  │ categoria: código conhecido (22, 246 = baixa) → regras por trecho do nome (ordem importa)
  │            → tipo de complemento → kind legado → "outros"
  │ descrição: só dos complementos (ou texto manual), sem identificadores técnicos
  ▼
movement-timeline.ts → buildTimeline()  → TimelineDay[] (agrupa por dia; ≥3 iguais seguidos viram "cluster")
  ▼
process-timeline.tsx (filtros por categoria, página de 60) → movement-detail-sheet.tsx (inclui JSON.stringify(raw))
```

### 13.3 "Receber movimentação"

Observei que **não existe recebimento automático**: não há cron, polling, webhook nem push. Uma movimentação nova só entra quando alguém (a) clica em **Atualizar** no perfil do processo ou (b) consulta o mesmo CNJ em "Novo processo". Em ambos os casos o caminho termina em `applyProcessSync`.

---

## 14. DataJud

### 14.1 Inventário

| Item | Onde | Detalhe |
|---|---|---|
| Script cliente | `python/datajud.py` | CLI; modo `--events` (NDJSON) usado pelas rotas; modo texto para diagnóstico |
| Runner | `lib/services/processes/python-lookup.ts` → `runPythonLookup()` | `spawn` + `readline` + abort + timeout duro |
| Protocolo | `lib/services/processes/lookup-events.ts` | tipos `LookupEvent`/`LookupResultLine`/`LookupErrorLine` + `describeEvent()` (texto em pt-BR) |
| Endpoints | `app/api/processes/search/route.ts` (stream), `app/api/processes/[id]/sync/route.ts` (JSON) | `authorize("processes.edit")` |
| Mapper | `lib/integrations/legal/datajud/mapper.ts` | `mapSearchResponse`, `pickBestHit`, `mapMovements`, `mapParties`, `mapComplements` |
| Erros | `lib/integrations/legal/datajud/errors.ts` + classes em `datajud.py` | mesmos códigos nos dois lados |
| Modelo neutro | `lib/integrations/legal/types.ts` | `ExternalProcess`, `ExternalMovement`, `ProviderName = "datajud"` |
| Ficha | `lib/services/processes/sheet.ts` | `ProcessSheet` |
| Cliente browser | `lib/services/processes/client.ts` | `searchProcessByCNJ`, `syncProcessById` |
| Fixtures de teste | `lib/integrations/legal/datajud/__fixtures__/responses.ts` | respostas simuladas |

### 14.2 Configuração

| Variável | Onde é lida | Uso |
|---|---|---|
| `DATAJUD_API_KEY` | `datajud.py` (`os.getenv`) | header `Authorization: APIKey <chave>`; ausente → `PROVIDER_NOT_CONFIGURED` |
| `PYTHON_BIN` | `python-lookup.ts` | executável (padrão `python3`; `python` no Windows) |
| `DATAJUD_PYTHON_TIMEOUT_MS` | `python-lookup.ts` | teto do processo filho (padrão 300000 ms) |

A chave pública do CNJ está **escrita no `.env.example`** (o comentário diz que é a chave pública divulgada). Todo o ambiente do Node é repassado ao Python (`env: { ...process.env, … }`) — inclusive `SUPABASE_SERVICE_ROLE_KEY`. Isso sugere que o script teria acesso a segredos que não usa (princípio do menor privilégio).

### 14.3 HTTP, retries, 429, timeout

- `BASE_URL = https://api-publica.datajud.cnj.jus.br`; `POST /{alias}/_search` com `{"size": 10, "query": {"match": {"numeroProcesso": "<20 dígitos>"}}}`.
- `requests.Session`, timeout `(10 s conexão, 120 s leitura)`.
- `DEFAULT_MAX_RETRIES = 6` → até **7 tentativas**.
- Backoff: `min(2**attempt, 30) + jitter(0..1)`.
- **429:** respeita `Retry-After` (segundos ou data HTTP), limitado a 30 s, + jitter.
- **408/5xx:** retry; 408/504 viram `TIMEOUT`, outros `UNAVAILABLE`.
- **401/403:** `AUTHENTICATION` sem retry.
- **200 sem hits com shards falhos ou `timed_out`:** tratado como falha temporária (`partial`) e repetido — decisão documentada no cabeçalho do script.
- **Outros status:** `UNAVAILABLE` com até 300 caracteres do corpo na mensagem (vai como `detail` ao navegador).
- Timeout global: o Node mata o processo após `HARD_TIMEOUT_MS`.

Pior caso aproximado (inferência): 7 tentativas × até 130 s + 6 esperas × até 31 s ≈ 17 min — mas o teto do Node corta em 5 min.

### 14.4 Cache e persistência

- SQLite `.data/datajud_cache.db`, TTL 6 h, **só resultados encontrados**; `--refresh` (sync) ignora a leitura e regrava.
- O resultado **não é persistido pelo servidor** no Postgres: a rota devolve a ficha e **o navegador** grava via store.

### 14.5 Mapeamento de movimentos e complementos tabelados

- `complementosTabelados[].descricao` → `MovementComplement.key` (ex.: `tipo_de_documento`); `.nome` → `.name` (ex.: `Certidão`); `.codigo` → `.code`; `.valor` → `.value`.
- `COMPLEMENT_LABEL` em `movement-interpreter.ts` traduz chaves comuns ("Tipo do documento", "Motivo da remessa"…); chaves desconhecidas viram frase com a 1ª letra maiúscula.
- `pickBestHit`: com múltiplos documentos para o mesmo número (graus diferentes), escolhe o de `dataHoraUltimaAtualizacao` mais recente; empate → mais movimentações. **Observação:** o LEXA guarda **um** hit; os demais graus são descartados.

### 14.6 Fallback

Não há provider alternativo. Em qualquer falha a UI mostra a mensagem e permite **cadastro manual** ("Você pode preencher os campos manualmente").

### 14.7 "Quando o usuário consulta um processo, o que acontece?" (resumo)

1. Navegador valida máscara, 20 dígitos e DV.
2. `POST /api/processes/search` — proxy exige sessão; rota exige membro ativo com `processes.edit`.
3. Servidor inicia `python3 python/datajud.py <cnj> --events`.
4. Python valida de novo, descobre o tribunal pelo segmento J.TR, consulta o cache e/ou o DataJud com retry.
5. Cada evento vira uma linha NDJSON no navegador, exibida no `LookupLog`.
6. Resultado bruto é normalizado **no servidor** (mapper → ficha) e enviado.
7. **No navegador**: se o CNJ já existe no escritório, `applyProcessSync`; senão, `importProcess`.
8. Store grava no Supabase em até ~300 ms; toast de sucesso com link "Abrir".

### 14.8 Onde trocar DataJud por outro provider

Observei uma fronteira explícita: tudo depois de `ExternalProcess` é neutro. Pontos de troca (inferência baseada nessa fronteira):

| Ponto | O que mudar |
|---|---|
| `lib/integrations/legal/types.ts` | adicionar ao union `ProviderName` e a `DataOrigin` (`types/index.ts`) |
| `lib/integrations/legal/<novo>/mapper.ts` | JSON do novo provider → `ExternalProcess` |
| `app/api/processes/search` e `[id]/sync` | hoje importam `mapSearchResponse` e `runPythonLookup` **diretamente** — é aqui que falta uma camada "provider" (ex.: `getLegalProvider().lookup(cnj)`) |
| `lib/services/processes/python-lookup.ts` / `python/datajud.py` | acoplados ao DataJud; um provider HTTP em TS dispensaria o Python |
| `components/processos/new-process-dialog.tsx` | textos "DataJud" em `lookupErrorTitle` e mensagens |
| `components/processos/process-source-panel.tsx` | `PROVIDER_LABEL` |
| `components/dashboard/kpi-cards.tsx` | "acompanhados pelo DataJud" (`source.provider === "datajud"`) |

`sheet.ts`, `import.ts`, `movements.ts`, `movement-interpreter.ts`, `movement-timeline.ts` e o store **não precisam mudar**.

---

## 15. Tarefas

### 15.1 Modelo

`Task` (`types/index.ts`): `title`, `description?`, `dueAt` (ISO local), `priority` (`alta|media|baixa`), `assigneeId`, `status` (`pendente|concluida`), `completedAt?`, `related?` (`{type:"client"|"process", id}`), `columnId?`. `TaskColumn`: `name`, `color`, `order`, `isDone?`.

### 15.2 Arquivos

`components/tasks/tasks-view.tsx` (página; modo lista/quadro, escopo "Minhas"/"Escritório", filtros, detalhe por `?tarefa=`), `board-view.tsx` (Kanban), `task-card.tsx` (cartão arrastável + menu "Mover para"), `task-item.tsx` (linha da lista), `task-row.tsx` (linha compacta + `useToggleTask`), `task-form-dialog.tsx` (criar/editar), `task-detail-sheet.tsx` (detalhe lateral).

### 15.3 CRUD

- **Criar:** `TaskFormDialog` (global `"task"` ou local) → `addTask({...payload, columnId})` — `columnId` = o da coluna clicada ou a 1ª coluna não concluída.
- **Editar:** mesmo formulário com `task` → `updateTask(id, payload)` (não altera `columnId`/`status`).
- **Concluir/reabrir:** `toggleTask(id)` (checkbox) — muda `status`/`completedAt`, **não muda `columnId`**; toast com "Desfazer".
- **Excluir:** `deleteTask(id)` (com `ConfirmDialog`).
- **Validação:** só título ≥ 3 caracteres. Data/hora do input nativo; nenhuma checagem de data passada.

### 15.4 Estados, filtros e agrupamento

- **Lista:** buckets por data (`taskBucket` em `lib/selectors.ts`: atrasadas, hoje, amanhã, esta semana, próximas, concluídas) e filtros (todas, hoje, atrasadas, alta prioridade, concluídas). **Observação:** os textos de apoio dos buckets estão **fixos no código** (`hint: "Quarta-feira, 23 set"`, `"Quinta-feira, 24 set"`, `"Até domingo, 27 set"` em `tasks-view.tsx`) — não acompanham a data real.
- **Escopo:** "Minhas" = `assigneeId === currentUserId()`; "Escritório" = todas.
- **Modo de visualização** persistido em `localStorage` (`lexa:tasks-view`).

### 15.5 Kanban e "mover entre colunas" (internamente)

```
TaskCard (draggable = can("tasks.edit"))
  onDragStart → e.dataTransfer.setData("text/plain", task.id)
        │
BoardView coluna (onDragOver: preventDefault se editável; destaca)
  onDrop → taskId = getData("text/plain") → moveTask(taskId, column.id)
        │   (alternativa sem arrastar: menu do cartão → onMove(columnId))
        ▼
demo-store.moveTask(taskId, columnId)
  • done = !!column.isDone
  • updated = { ...task, columnId, status: done ? "concluida" : "pendente",
                completedAt: done ? (task.completedAt ?? agora) : undefined }
  • se passou de pendente → concluída: logActivity("concluiu uma tarefa")
  • commit → persist (300 ms) → upsert em public.tasks (RLS tasks_update: tasks.edit)
```

- Tarefa sem `columnId` aparece na **primeira coluna** (`t.columnId ?? firstColumnId`).
- **Colunas padrão** ("A fazer", "Em andamento", "Concluído"→`isDone`) são criadas por um `useEffect` em `BoardView` na primeira abertura, **no navegador**, se o escritório não tiver colunas e o usuário puder editar. **Potencial risco:** dois usuários abrindo o quadro ao mesmo tempo num escritório novo criam dois conjuntos de colunas (não há unicidade nem trava).
- `deleteTaskColumn` (nunca a última) move as tarefas para a coluna restante de menor `order`, ajustando status. O texto do `ConfirmDialog` diz "serão movidas para a coluna anterior" — o código move para **a primeira** coluna, não para a anterior.
- **Inconsistência observada:** concluir pelo checkbox (`toggleTask`) não move o cartão para a coluna `isDone`; o cartão continua em "A fazer" com status "concluida". Mover pelo quadro sincroniza os dois.
- **Reordenação dentro da coluna:** não existe (não há campo de ordem na tarefa).

### 15.6 Permissões

`tasks.view` para ver (RLS), `tasks.edit` para criar/editar/arrastar (RLS + UI). Nenhuma regra de "só o responsável pode concluir" — qualquer membro com `tasks.edit` altera qualquer tarefa.

---

## 16. Agenda

### 16.1 Arquivos

`components/agenda/agenda-view.tsx` (dia/semana/mês, navegação, legenda de categorias, "Só minhas"), `time-grid.tsx` (grade de horários; clique em horário vazio → `onCreate`), `month-grid.tsx`, `agenda-list.tsx` (mobile), `layout-events.ts` (`layoutDay`: distribui eventos sobrepostos em colunas), `appointment-detail.tsx` (detalhe + excluir + "Enviar lembrete" simulado), `new-appointment-dialog.tsx`, `category-picker.tsx` (CRUD de categorias inline), `use-category.ts` (`useCategoryLookup`).

### 16.2 Funcionalidades observadas

| Funcionalidade | Existe? | Onde |
|---|---|---|
| Criar compromisso | Sim | `addAppointment` |
| Editar compromisso | **Não** (não há ação `updateAppointment`) | — |
| Excluir | Sim | `deleteAppointment` (em `appointment-detail.tsx`) |
| Categorias (criar/renomear/recolorir/excluir) | Sim | `add/update/deleteAppointmentCategory`; excluir limpa `categoryId` dos compromissos |
| Recorrência | **Não** | — |
| Compromisso de vários dias | Não suportado pelo formulário (início e término no mesmo `date`) | `new-appointment-dialog.tsx` |
| Relação com cliente/processo | Sim (`clientId`, `processId`; `personName` e `area` copiados do cliente no momento da criação) | |
| Responsável | `ownerId` | |
| Filtros | por categoria (legenda) e "Só minhas" | `agenda-view.tsx` |
| Lembrete por WhatsApp | **Simulado** (toast) | `appointment-detail.tsx` |
| Integração Google Agenda | **Simulada** (card em configurações) | `settings-view.tsx` |

### 16.3 Fluxo de criação de compromisso

```
Botão/slot (AgendaView → openDialog("appointment", {date}) | perfil do cliente/processo → {clientId, processId})
  ▼
NewAppointmentDialog → AppointmentForm (useState)
  • título ≥ 3; término > início (comparação de strings "HH:MM")
  • ao mudar início, mantém a duração (mín. 15 min); padrão 14:00–15:00
  • CategoryPicker pode criar categoria na hora (addAppointmentCategory)
  ▼
addAppointment({ title, categoryId, start:`${date}T${time}:00`, end, ownerId,
                 clientId?, processId?, personName: client?.name, area: client?.area, notes? })
  • appointments: [...s.appointments, appt]  (append no fim; ordem cronológica)
  • activity "X agendado com Y." (detail com dd/mm, hh:mm)
  ▼
persist → upsert public.appointments (RLS agenda.edit) [+ appointment_categories se criou categoria]
  ▼
Toast "Compromisso agendado." → grade/dashboard re-renderizam a partir do store
```

**Observação:** não há checagem de conflito de horário nem de data no passado.

---

## 17. Documentos

### 17.1 Onde o arquivo fica? Onde ficam os metadados?

| Pergunta | Resposta (observada) |
|---|---|
| Onde fica o arquivo? | **Supabase Storage**, bucket privado `documents`, caminho `<organization_id>/file_<uuid>.<ext>` (`new-document-dialog.tsx`) |
| Onde ficam os metadados? | Tabela `public.documents`, coluna `data` = `LegalDocument` (`name`, `kind`, `extension`, `sizeBytes`, `clientId?`, `processId?`, `uploadedById`, `uploadedAt`, `storagePath?`) |
| Como o sistema encontra o arquivo? | Pelo `storagePath` guardado nos metadados → `createSignedUrl(storagePath, 300)` em `lib/documents.ts` |
| Como funciona o preview? | `DocumentPreviewSheet` (`components/shared/document-preview-sheet.tsx`) gera URL assinada de **5 min**; PDF em `<iframe>`, JPG/PNG em `<img>`, TXT via `fetch(url).text()` em `<pre>`; DOC/DOCX sem preview (só download) |
| Download | `downloadDocument` → URL assinada com `download: doc.name` → `window.location.assign(url)` |
| Exclusão | `deleteDocument` → store → `syncState` apaga a linha e, **se a exclusão foi confirmada** (`.select("id")`), remove o arquivo do Storage |

### 17.2 Upload (fluxo)

```
NewDocumentDialog → DocumentForm
  • escolher/arrastar arquivo → pick(): tamanho ≤ 25 MB (MAX_BYTES)
  • ou "Usar arquivo de exemplo" → cria SÓ metadados (sem arquivo; storagePath undefined)
  • extensão = última parte do nome; se não estiver em [pdf, docx, doc, txt, jpg, png] → vira "pdf"
  • contentType = MIME[extension]  (definido pela extensão, não pelo navegador)
  ▼
getSupabase().storage.from("documents").upload(`${currentOrgId()}/${uid("file")}.${ext}`, file)
  (política documents_files_insert: pasta = current_org_id() e documents.edit)
  ▼
addDocument({ name, kind, clientId?, processId?, extension, sizeBytes, storagePath })
  → store → persist → upsert public.documents (RLS documents.edit) + activity
```

### 17.3 Tipos, tamanho, permissões

- Tipos de documento (`DocumentKind`): Contrato, Procuração, Documento pessoal, Petição, Comprovante, Laudo, Decisão.
- Tamanho: 25 MB no cliente **e** no bucket (`file_size_limit`).
- Permissões: `documents.view` (ler metadados e gerar URL), `documents.edit` (upload, excluir) — no banco e no Storage.

### 17.4 Observações

- **Extensão desconhecida vira `.pdf`** (ex.: `planilha.xlsx` é gravada como `…/file_x.pdf` com `application/pdf`). **Potencial risco** de integridade (arquivo ilegível no preview).
- Não há verificação do conteúdo real (magic bytes) no servidor.
- **Arquivo órfão:** se o upload no Storage der certo e a gravação dos metadados for negada/falhar, o arquivo fica no bucket sem referência (o rollback do store não remove o arquivo).
- A descrição da página diz "armazenados com criptografia" (`documents-view.tsx`). **Não foi possível determinar pelo código analisado** — não há criptografia na aplicação; se existir, é a do provedor de Storage.
- URL assinada é válida por 5 min para qualquer pessoa que a possua.
- Não há edição de metadados (renomear, trocar tipo/vínculo) nem versionamento.

---

## 18. Financeiro

### 18.1 O que existe

| Item | Observado |
|---|---|
| Modelo | `Invoice`: `clientId`, `processId?`, `description`, `amount`, `dueDate`, `paidAt?`, `status` (`pago|pendente|atrasado`), `method?` (`Pix|Boleto|Transferência|Cartão`) |
| Tabela | `public.invoices` (RLS `finance.view`/`finance.edit`) |
| Tela | `components/financeiro/finance-view.tsx` + `revenue-chart.tsx` (Recharts) |
| Aba do cliente | `components/clientes/profile/finance-tab.tsx` |
| Cálculos | `lib/selectors.ts` (`clientFinance`, `openReceivables`, `monthlyRevenue`, `financeSummary`, `revenueByArea`, `sum`) — testados em `lib/selectors.test.ts` |
| **Criar/editar/baixar fatura** | **Não existe.** Não há `addInvoice`/`updateInvoice` em `DemoActions`, nem formulário, nem rota. |
| Status "atrasado" | **Campo armazenado**, não calculado. Nada muda `pendente → atrasado` quando vence. |
| Exportar relatório | **Simulado** (toast "financeiro-AAAA-MM.xlsx") |
| Enviar cobrança | **Simulado** (toast "Mensagem enviada por e-mail e WhatsApp") |
| Categorias financeiras, despesas, lançamentos genéricos | **Não existem** (só faturas de honorários) |

Isso sugere que o módulo financeiro está **pronto para exibir** dados, mas hoje só mostraria algo se faturas fossem inseridas diretamente no banco.

### 18.2 Regras de cálculo (observadas em `lib/selectors.ts`)

- **Em aberto** = soma de faturas com `status !== "pago"`.
- **Prevista no mês** = soma das faturas com `dueDate` no mês.
- **Recebida no mês** = soma das faturas `pago` cujo `paidAt ?? dueDate` cai no mês.
- **Crescimento** = variação da recebida vs. mês anterior (indefinido se anterior = 0).
- **Inadimplência** = soma `atrasado` / soma de **todas** as faturas × 100.
- **Receita por área** = pagas no ano, agrupadas por `client.area` (fatura de cliente excluído é ignorada).
- **Honorários contratados do cliente** = pago + em aberto.

Todos os cálculos acontecem **no navegador**, sobre todas as faturas carregadas.

---

## 19. Dashboard

`components/dashboard/dashboard-view.tsx` só renderiza depois de `hydrated`. **Todas as métricas são calculadas no frontend**, a partir do store; nenhuma é calculada no backend nem armazenada no banco.

| Card / painel | Componente | Fonte (hook) | "Query" (filtro em memória) | Tabela de origem | Regra | Permissão para aparecer |
|---|---|---|---|---|---|---|
| **Processos ativos** | `kpi-cards.tsx` | `useDemoData().processes` | `status !== "concluido"` | `processes` | contagem, 2 dígitos. Rodapé: nº com `source.provider === "datajud"` | `processes.view` |
| **Compromissos hoje** | `kpi-cards.tsx` | `appointments` | `todaysAppointments()` → `isSameDay(start, agora)` | `appointments` | contagem; rodapé: próximo com `start > agora` | `agenda.view` |
| **Tarefas pendentes** | `kpi-cards.tsx` | `tasks` | `status === "pendente"` | `tasks` | contagem do **escritório inteiro**; rodapé: atrasadas (`isOverdue`) e de hoje (`taskBucket === "hoje"`) | `tasks.view` |
| **Honorários em aberto** | `kpi-cards.tsx` | `invoices` | `openReceivables()` | `invoices` | soma não pagas; rodapé: soma `atrasado` | `finance.view` |
| Saudação + "Próximo em X min" | `greeting.tsx` | `appointments` | `todaysAppointments().find(start > agora)` | `appointments` | minutos até o próximo | (sempre; lista vazia sem `agenda.view` pela RLS) |
| Minhas tarefas | `my-tasks.tsx` | `tasks` | `assigneeId === eu && pendente && dueAt ≤ hoje` | `tasks` | lista com ordem "congelada" no `useState` inicial para não pular ao concluir | `tasks.view` |
| Atividade recente | `recent-activity.tsx` | `activities` | `activities.slice(0, limit)` | `activities` | mais recentes primeiro | **nenhuma** |
| Agenda de hoje | `today-agenda.tsx` | `appointments`, `processes` | `todaysAppointments()` | `appointments` | marca "agora" | `agenda.view` |
| Receita | `revenue-panel.tsx` | `invoices` | `financeSummary()`, `monthlyRevenue()` (6 meses) | `invoices` | ver seção 18.2 | `finance.view` |
| Badge "Tarefas" no menu | `sidebar-nav.tsx` | `tasks` | `status === "pendente"` | `tasks` | contagem do escritório | — |

Cadeia típica, exemplo "Processos ativos":

```
UI (card)  →  KpiCards (components/dashboard/kpi-cards.tsx)
           →  useDemoData()  (lib/store/demo-store.tsx, contexto)
           →  estado carregado por loadState() (lib/store/storage.ts)
           →  supabase.from("processes").select("data") paginado (RLS processes.view)
           →  tabela public.processes
           →  regra: processes.filter(p => p.status !== "concluido").length  (no navegador)
```

---

## 20. WhatsApp

**Conclusão: não há implementação de WhatsApp.** Não existe provider (Z-API, Meta Cloud API ou outro), webhook, endpoint, tabela de conversas/mensagens/contatos, chatbot, fila ou variável de ambiente relacionada.

O que existe (tudo interface ou simulação):

| Onde | O que é |
|---|---|
| `types/index.ts` → `ClientSource` | valor `"WhatsApp"` como origem do cliente (não há tela que preencha `source`) |
| `components/clientes/source-icon.tsx` | ícone `MessageCircle` para a origem "WhatsApp" |
| `components/configuracoes/settings-view.tsx` → `INTEGRATIONS` | card "WhatsApp Business" com botão **Conectar** que só muda estado local e mostra toast "Ambiente de demonstração — nenhuma conta real foi vinculada." |
| `settings-view.tsx` → `NotificationsSection` | canal "WhatsApp" em toggles de notificação (estado local, botão "Salvar" só mostra toast) |
| `components/agenda/appointment-detail.tsx` | botão "Enviar lembrete" → toast "receberá a confirmação por WhatsApp" |
| `components/financeiro/finance-view.tsx` | "Enviar cobrança" → toast "Mensagem enviada por e-mail e WhatsApp" |
| `ARCHITECTURE.md` §7 | lista WhatsApp em "O que ainda é simulado" |

Os fluxos "Mensagem recebida → webhook → banco → UI" e "Usuário responde → provider → WhatsApp" **não existem no código**. Onde se encaixariam (inferência, seguindo os padrões atuais): webhook em `app/api/<...>/route.ts` fora do `proxy` protegido (precisaria ser rota pública com validação de assinatura), escrita com `getSupabaseAdmin()` em novas tabelas por escritório (mesmo padrão `organization_id + RLS`), e envio via rota de servidor com a credencial do provider.

---

## 21. LEXA IA / Gemini

**Conclusão: não há implementação de IA.** Busquei por `gemini`, `genai`, `google.generativeai`, `openai`, `anthropic` e similares em todo o código (TS, TSX, Python, SQL, JSON, MD): **nenhuma ocorrência**. Não há SDK no `package.json`, nem variável de ambiente, nem endpoint, nem prompts, schemas de saída, *context builders* ou componente de chat. O único elemento visual próximo é o ícone `WandSparkles` do botão **"Preencher"** do formulário de processo — que chama o DataJud, não IA.

Portanto os riscos pedidos (dados excessivos, vazamento entre tenants, exposição de API key, prompt injection, respostas não estruturadas, chamadas duplicadas, custo) **não se aplicam ao código atual**. Pontos de atenção para quando for implementado (inferência a partir da arquitetura existente):

- **Onde o contexto estaria disponível:** hoje todo o dado do escritório está **no navegador** (`useDemoData()`). Montar o contexto no cliente e enviá-lo a uma rota seria o caminho mais curto — e o mais arriscado (o cliente poderia enviar qualquer coisa; excesso de dados). Uma rota de servidor com `requireMember()` + leitura via `createSupabaseServer()` (sujeita à RLS) manteria o isolamento por escritório do jeito que o resto do sistema já faz.
- **Chave:** deveria seguir o padrão de `DATAJUD_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (só servidor, sem `NEXT_PUBLIC_`).
- **Prompt injection:** movimentações do DataJud (`raw`, nomes, complementos) e textos livres (descrições de tarefas, notas de compromisso) seriam conteúdo não confiável dentro do prompt.

---

## 22. APIs

### 22.1 Duas "APIs" diferentes

1. **API do Next.js** (`app/api/**`): 18 handlers + 1 rota de auth (`/auth/confirm`). Inventário abaixo.
2. **API do Supabase (PostgREST/Storage/Auth)** usada **direto pelo navegador** — é por ela que passa todo o CRUD de domínio:

| Operação | Chamada (navegador) | Arquivo | Proteção |
|---|---|---|---|
| Carregar tudo | `from(<tabela>).select("data").order("created_at").order("id").range(...)` × 10 tabelas | `lib/store/storage.ts` → `loadState` | RLS select |
| Gravar alterações | `from(<tabela>).upsert(rows, {onConflict:"organization_id,id"})` | `storage.ts` → `syncState` | RLS insert/update |
| Excluir | `from(<tabela>).delete().eq("organization_id").in("id").select("id")` | `storage.ts` | RLS delete |
| Remover arquivo de documento | `storage.from("documents").remove(paths)` | `storage.ts` | Storage policy |
| Upload de documento | `storage.from("documents").upload(path, file)` | `new-document-dialog.tsx` | Storage policy |
| URL assinada | `storage.from("documents").createSignedUrl(path, 300)` | `lib/documents.ts` | Storage policy |
| Perfil/escritório/membros | `from("profiles"|"organizations").select(...)` | `lib/auth/session.tsx` | RLS |
| Editar próprio perfil | `from("profiles").update({...}).eq("id")` | `profile-section.tsx` | RLS + GRANT por coluna |
| Editar escritório | `from("organizations").update({...})` | `office-section.tsx` | RLS `office.manage` + GRANT |
| Avatar | `storage.from("avatars").upload/remove/getPublicUrl` | `profile-section.tsx` | Storage policy |
| Login/logout/senha | `auth.signInWithPassword`, `auth.signOut`, `auth.updateUser`, `auth.refreshSession` | forms de auth, `session.tsx`, `profile-section.tsx` | Supabase Auth |

### 22.2 Inventário das rotas do Next.js

Formato de erro: **A** = `{ error: string }` (via `route()`); **B** = `{ error: { code, message, detail? } }`.

| # | Método e caminho | Auth | Input | Output | Banco | Efeitos colaterais | Erros | Usado por |
|---|---|---|---|---|---|---|---|---|
| 1 | `POST /api/processes/search` | proxy (sessão) + `authorize("processes.edit")` | `{ cnj: string ≤ 32 }` | **NDJSON**: `event*` → `result{found, sheet, cached, fetchedAt}` ou `error{code,message,detail}` | nenhum (Postgres); SQLite cache | spawn Python; HTTP DataJud; grava cache | 400 (JSON inválido/CNJ), 401/403 (B), erros no stream | `lib/services/processes/client.ts` → `searchProcessByCNJ` → `new-process-dialog.tsx` |
| 2 | `POST /api/processes/[id]/sync` | idem | path `id` (`^[A-Za-z0-9_-]{1,64}$`), `{ cnj }` | `{ processId, sheet, provider, cached, fetchedAt }` | SQLite (refresh) | spawn Python `--refresh` | 400, 404 NOT_FOUND, 422, 429, 502, 503, 504, 500 (B) | `syncProcessById` → `process-source-panel.tsx` |
| 3 | `POST /api/auth/signup` | pública | `{ name, email, password, officeName, cnpj? }` | `201 {ok:true}` | insert `organizations` (pending), `auth.users`, `profiles` (owner) — service role | rollback manual em falhas | 400 validação, 409 e-mail existe, 500 (A) | `signup-form.tsx` |
| 4 | `POST /api/auth/recover` | pública | `{ email }` | `{ok:true}` sempre | `auth.admin.generateLink` | **imprime o link no log** | 400 JSON inválido (A) | `recover-form.tsx` |
| 5 | `PATCH /api/me/email` | `requireMember()` | `{ email, password }` | `{ok:true}` | `auth.admin.updateUserById`, `profiles.update(email)` | valida senha com cliente descartável | 400, 409, 403, 500 (A) | `profile-section.tsx` |
| 6 | `GET /api/team/users` | `requireMember("users.manage")` | — | `{ members: MemberAccess[] }` | `profiles` + `auth.admin.getUserById` por membro | — | 401/403/500 | `members-manager.tsx` (apiBase `/api/team/users`) |
| 7 | `POST /api/team/users` | idem | `{ email, name, role, jobTitle? }` | `201 { member }` | `auth.admin.createUser`, `profiles.insert` | link de convite no log | 400, 409 | idem |
| 8 | `PATCH /api/team/users/[id]` | idem | `MemberPatch` (`name, jobTitle, phone, oab, role, permissions, active`) | `{ member }` | `profiles.update` | — | 400 (auto-alteração, último sócio), 404 | idem |
| 9 | `DELETE /api/team/users/[id]` | idem | — | `{ok:true}` | `auth.admin.deleteUser` (perfil em cascata) | registros criados pela pessoa passam a "Usuário removido" | 400, 404 | idem |
| 10 | `POST /api/team/users/[id]/invite` | idem | — | `{ok:true}` | `generateLink` | link no log | 400 (inativo), 404 | idem |
| 11 | `GET /api/admin/organizations` | `requireSuperAdmin()` | — | `{ organizations: [...+memberCount, activeCount, owners] }` | todas as orgs + todos os perfis | — | 401/403 | `admin-view.tsx` |
| 12 | `POST /api/admin/organizations` | idem | `{ name, cnpj?, plan?, ownerName, ownerEmail }` | `201 { organization }` | insert org `active` + `inviteMember(owner)` | rollback da org se convite falhar | 400, 409 | `admin-view.tsx` |
| 13 | `PATCH /api/admin/organizations/[id]` | idem | `{ status?, plan?, name? }` | `{ organization }` | `organizations.update` (+`approved_at`) | desativar bloqueia todos (RLS) | 400, 404 | `admin-view.tsx` |
| 14–18 | `GET/POST /api/admin/organizations/[id]/users`, `PATCH/DELETE …/[userId]`, `POST …/[userId]/invite` | idem | como 6–10 | como 6–10 | como 6–10 (org da URL) | como 6–10 | como 6–10 | `MembersManager` com `apiBase` do admin |
| 19 | `GET /auth/confirm` | pública | `?token_hash&type=recovery|invite&next` | redirect | `auth.verifyOtp` (cria sessão em cookie) | — | redirect `/login?erro=link` | links de e-mail |

**Validação de entrada:** manual (tipos TS são só *cast* — `readJson<T>()` não valida). Onde há regra, ela é explícita no handler (`isEmail`, `passwordProblem`, `MEMBER_ROLES.includes`, `STATUSES/PLANS.includes`, `ID_PATTERN`, `MAX_INPUT`).

**Inconsistências de API:** dois formatos de erro (A e B); rotas de processo não usam `route()`; `team/users` responde com `{ member }`/`{ members }`, admin com `{ organization }`/`{ organizations }`.

---

## 23. Estado do frontend

### 23.1 Mapa

| Tipo de estado | Onde | Local/Global | Origem | Persistido? |
|---|---|---|---|---|
| Dados do escritório (10 coleções) + `hydrated` | `DemoStoreProvider` (`useState` + `stateRef`) | **Global** (Context `DataContext`) | Servidor (Supabase) | Sim, no Postgres via `syncState` |
| Ações de negócio | `ActionsContext` (`useMemo` com deps `[]`, estável) | Global | — | — |
| Último estado salvo | `savedRef` | Interno ao provider | — | — |
| Fila de gravação | `queueRef` (Promise encadeada) | Interno | — | — |
| Sessão (usuário, escritório, membros, `can`) | `SessionProvider` | Global (Context) | Supabase | Sessão em cookie |
| Conta "atual" para código não-React | `lib/account.ts` (variável de módulo `state`) | **Global mutável (singleton)** | preenchido por `SessionProvider` | Não |
| Diálogo aberto, Ctrl+K, menu mobile | `UIProvider` | Global | — | Não |
| Sidebar recolhida | `createLocalStore("lexa:sidebar-collapsed")` + `useSyncExternalStore` | Global | — | `localStorage` |
| Tema | `createLocalStore("lexa:theme")` (`lib/theme.tsx`) | Global | — | `localStorage` |
| Modo de tarefas (quadro/lista) | `createLocalStore("lexa:tasks-view")` | Global | — | `localStorage` |
| Filtros, buscas, ordenação, abertos/fechados, formulários | `useState` em cada view | Local | — | Não |
| Aba do cliente, tarefa aberta, seção de configurações | URL (`?tab=`, `?tarefa=`, `?secao=`) | URL | — | Na URL |
| Integrações "conectadas", preferências de notificação | `useState` em `settings-view.tsx` | Local | — | **Não** (perdidas ao recarregar) |
| Membros (tela de gestão) | `useState` em `members-manager.tsx` via `fetch` | Local | API | — |

Não há Redux, Zustand, React Query, SWR ou `sessionStorage`.

### 23.2 Padrões que merecem atenção (apenas documentação)

- **Re-render amplo:** `useDemoData()` devolve o objeto de estado inteiro. Qualquer mudança em qualquer coleção cria um novo objeto e re-renderiza **todos** os 33 componentes consumidores (sidebar, topbar, command menu, dashboard, views). Não há seletores nem divisão de contexto por coleção.
- **Cálculos pesados no render sem memo:** ex. `DocumentsView` faz `clients.find` e `processes.find` para cada documento a cada render; `TasksView` chama `describeRelated` (com `find`) para cada tarefa; `counts` recalculados em todas as views. Complexidade O(N·M) por render.
- **Dados desatualizados entre usuários:** não há *realtime*/polling. O store só é carregado uma vez por sessão (o comentário diz "Uma única vez por sessão"); mudanças feitas por colegas só aparecem ao recarregar a página ou quando uma gravação falha (que dispara `loadState`).
- **Last-write-wins por entidade inteira:** `upsert` envia o objeto inteiro (`data`). Duas pessoas editando o mesmo processo → a última gravação sobrescreve a outra (inclusive movimentações importadas pela outra pessoa).
- **Race de criação antes do carregamento:** ações executadas antes de `hydrated` são mescladas com `mergeById` ao terminar o carregamento — tratado explicitamente.
- **Race no código sequencial do processo:** `nextProcessCode` usa só o estado local; dois usuários podem gerar o mesmo `#1030xx`.
- **Otimismo + rollback:** a UI mostra sucesso antes de gravar; se a gravação falhar, `replaceWithServer(loadState())` substitui **todo** o estado pelo do servidor — alterações feitas depois do lote que falhou e ainda não gravadas também são descartadas (e `savedRef` já havia sido marcado como salvo antes da confirmação).
- **`MyTasks`** congela a lista de IDs no primeiro render (intencional, para o item não "pular").
- **`DocumentPreviewSheet`** faz `setShown` durante o render (padrão de "derivar estado do prop") — intencional para manter o conteúdo durante a animação de fechar.
- **`TasksView`** também ajusta estado durante o render (`lastOpenId`).
- **Fetch duplicado:** a consulta CNJ é abortada ao reconsultar/fechar (AbortController). O botão "Atualizar" fica desabilitado durante a chamada. Não observei fetch duplicado sistemático.

---

## 24. Fluxos críticos

Formato: **AÇÃO → COMPONENTE → FUNÇÃO → API → SERVICE → DATABASE → RESPONSE → UI**.

### 24.1 Login
`/login` → `LoginForm` (`components/auth/login-form.tsx`) → `submit()` → `getSupabase().auth.signInWithPassword` → Supabase Auth (sem rota Next) → cookies → `hardNavigate(safeNext(next))` → `proxy.ts` (`auth.getUser`) → `/dashboard` → `SessionProvider.loadSession()` (`profiles`, `organizations`, membros) → `setAccount` → `DemoStoreProvider.loadState()` (10 tabelas) → `DashboardView`.

### 24.2 Criar cliente
Ver seção 11.3 (`clients-view.tsx` → `openDialog("client")` → `NewClientForm.submit` → `addClient` → `persist` → `syncState` → `upsert public.clients` (RLS) → toast/lista).

### 24.3 Abrir cliente
`/clientes` → linha (`router.push('/clientes/[id]')`) → `app/(app)/clientes/[id]/page.tsx` (`await params`) → `ClientProfile` → `useDemoData()` (já em memória; **sem chamada de rede**) → filtros derivados (processos, documentos, tarefas, faturas, compromissos, atividades) → abas por `?tab=`.

### 24.4 Criar processo (manual)
`ProcessesView` "Novo processo" → `openDialog("process")` → `ProcessForm.submit` (20 dígitos, tipo ≥ 3, duplicidade local) → `addProcess` (`code` sequencial + movimentação "Processo cadastrado") → `persist` → `upsert public.processes` → toast "Processo cadastrado" com "Abrir".

### 24.5 Consultar processo (DataJud)
Ver seção 12.8.

### 24.6 Receber movimentação (sincronização manual)
`ProcessProfile` → `ProcessSyncPanel` "Atualizar" → `syncProcessById()` → `POST /api/processes/[id]/sync` → `authorize` → `runPythonLookup(--refresh)` → DataJud → `mapSearchResponse` → `buildProcessSheet` → JSON → `applyProcessSync` (hash/dedupe) → `commit` (+ activity se houve novidade) → `persist` → `upsert public.processes` → toast "N novas movimentações" → `ProcessTimeline` re-renderiza.

### 24.7 Criar tarefa
Botão "Nova tarefa" (tarefas, cliente, processo, coluna do quadro) → `openDialog("task", defaults)` → `TaskFormDialog`/`TaskForm.submit` (título ≥ 3) → `addTask({...payload, columnId})` → activity → `persist` → `upsert public.tasks` → toast.

### 24.8 Criar compromisso
Ver seção 16.3.

### 24.9 Upload de documento
Ver seção 17.2 (`storage.upload` direto do navegador **antes** de `addDocument`).

### 24.10 Lançamento financeiro
**Não existe no código.** Não há ação, formulário nem rota para criar ou alterar `invoices`. O único fluxo financeiro é de leitura: `FinanceView` → `useDemoData().invoices` → `lib/selectors.ts` → cards/gráfico.

### 24.11 LEXA IA
**Não existe no código** (seção 21).

### 24.12 WhatsApp
**Não existe no código** (seção 20).

### 24.13 Convidar membro (fluxo extra, relevante)
`/configuracoes?secao=usuarios` → `MembersManager` (`apiBase="/api/team/users"`) → `call(POST)` → `requireMember("users.manage")` → `inviteMember()` (`lib/auth/members.ts`: `auth.admin.createUser` + `profiles.insert` + link de recuperação) → `sendAuthLink()` imprime no log → `201 { member }` → lista atualizada.

### 24.14 Aprovar escritório (Super Admin)
`/admin` → `(admin)/layout.tsx` checa papel no servidor → `AdminView` → `PATCH /api/admin/organizations/[id] {status:"active"}` → `approved_at` → a partir daí `current_org_id()` passa a devolver o escritório e os membros acessam os dados.

---

## 25. Regras de negócio

| # | Regra (observada) | Onde está implementada | Camada |
|---|---|---|---|
| 1 | Todo dado jurídico pertence a um escritório e só é visto/gravado por membros ativos de escritório ativo | RLS `current_org_id()` | **Banco** |
| 2 | Cada módulo exige `.view` para ler e `.edit` para gravar | RLS `has_perm()` + UI `can()` | **Banco** (+UI) |
| 3 | Sócio tem todas as permissões, sempre | `has_perm` (SQL) + `effectivePermissions` (TS) | Banco + servidor + UI |
| 4 | Papel/permissões/status/e-mail só mudam pelo servidor | GRANT por coluna + rotas com service role | **Banco + servidor** |
| 5 | Não pode alterar o próprio papel/permissões/status nem remover a si mesmo | `updateMember`/`removeMember` | **Servidor** |
| 6 | Escritório precisa de ≥ 1 sócio ativo | `activeOwners()` em `members.ts` | **Servidor** (sem trava transacional) |
| 7 | Uma pessoa pertence a um escritório | e-mail único em `auth.users` + mensagem 409 | Supabase Auth + servidor |
| 8 | Cadastro público cria escritório `pending`; só o Super Admin ativa | `signup/route.ts` + `current_org_id()` exige `active` | Servidor + banco |
| 9 | Super admin não tem escritório | constraint `profiles_org_matches_role` | **Banco** |
| 10 | Senha ≥ 8 caracteres com letras e números | `passwordProblem` | Servidor **no cadastro**; **só frontend** em troca/redefinição de senha (`updateUser` direto no Supabase) |
| 11 | CPF 11 / CNPJ 14 dígitos | `NewClientForm.submit` | **Só frontend** |
| 12 | CPF/CNPJ não pode duplicar | `clients.some(...)` | **Só frontend** |
| 13 | Nome do cliente ≥ 3 caracteres | `NewClientForm` | **Só frontend** |
| 14 | Novo cliente nasce com status `novo` | `addClient` | Frontend (store) |
| 15 | CNJ tem 20 dígitos e DV válido (MOD 97-10) | `lib/cnj.ts` (consulta) + `datajud.py` | Frontend + **servidor (Python)** na consulta; **só 20 dígitos** (sem DV) no cadastro manual |
| 16 | CNJ não pode duplicar no escritório; consultar CNJ existente atualiza em vez de criar | `findByCnj` + `applyProcessSync` | **Só frontend** |
| 17 | Código interno do processo sequencial a partir de `#103000` | `nextProcessCode` | Frontend (sem garantia de unicidade) |
| 18 | Movimentação não é importada duas vezes | `movementHash` + `diffMovements` | Frontend (store), hash gerado no servidor |
| 19 | Sincronização nunca apaga dado já preenchido | `applyProcessSync` (`sheet.x ?? current.x`) | Frontend |
| 20 | Status do processo é do escritório; situação da fonte fica à parte (`source.sourceStatus`) | `buildProcessDraft`, tipos | Frontend |
| 21 | Tribunais suportados = mapa J.TR em `datajud.py` | `TRIBUNALS` | Servidor (Python) |
| 22 | Só acertos vão para o cache (6 h) | `lookup()` | Servidor (Python) |
| 23 | Tarefa em coluna `isDone` é concluída; sair dela reabre | `moveTask` | Frontend |
| 24 | Nunca excluir a última coluna; tarefas da excluída vão para a primeira restante | `deleteTaskColumn` + UI `canDelete` | Frontend |
| 25 | Término do compromisso depois do início | `AppointmentForm.submit` | **Só frontend** |
| 26 | Excluir categoria deixa compromissos "Sem categoria" | `deleteAppointmentCategory` | Frontend |
| 27 | Arquivo ≤ 25 MB | form + bucket `file_size_limit` | Frontend + **Storage** |
| 28 | Arquivo fica na pasta do escritório | política do Storage | **Storage** |
| 29 | Excluir documento remove o arquivo | `syncState` | Frontend |
| 30 | Atividades são só inserção (histórico) | ausência de política UPDATE/DELETE + `APPEND_ONLY` | **Banco** + frontend |
| 31 | Excluir usuário mantém registros ("Usuário removido") | `removeMember` + `getUser` fallback | Servidor + frontend |
| 32 | Inadimplência = vencido ÷ faturado | `financeSummary` | Frontend |
| 33 | Recuperação de senha não revela se o e-mail existe | `recover/route.ts` | Servidor |
| 34 | Redirecionamento pós-login só para caminho interno | `safeNext` | Frontend + `/auth/confirm` |

**Regras apenas no frontend (e, portanto, contornáveis por quem chama o PostgREST direto com o próprio token):** 10 (parcial), 11, 12, 13, 14, 16, 17, 19, 23–26, 29 e toda a "forma" dos objetos em `data`. **Potencial risco:** um membro com `clients.edit` pode gravar, pelo console do navegador, clientes sem nome, com CPF duplicado, ou objetos com campos arbitrários, e a UI de todos os colegas passaria a ler esse JSON sem validação (`loadCollection` faz apenas `row.data` com *cast*).

---

## 26. Segurança

> Análise estática apenas. Classificação: **CRÍTICO / ALTO / MÉDIO / BAIXO**. Não encontrei problema que justifique objetivamente "CRÍTICO".

| Tema | Observação | Risco |
|---|---|---|
| **Isolamento entre escritórios** | RLS em todas as tabelas de dados + Storage por pasta; `security definer` com `search_path` fixo; `execute` revogado de `anon`. Nenhum caminho cross-tenant encontrado. | (ponto forte) |
| **Integridade/validação** | CRUD direto do navegador sem validação no servidor; `data jsonb` sem schema. | **ALTO** |
| **Links de autenticação em log** | `lib/auth/mailer.ts` imprime links de recuperação/convite com `token_hash` válido em `console.info`. Em produção, quem lê os logs pode assumir contas. | **ALTO** (em produção) |
| **Consumo de recursos (DataJud)** | Qualquer membro com `processes.edit` dispara processos Python de até 5 min, sem limite de concorrência, fila ou rate limit por usuário/escritório. | **ALTO** |
| **Cadastro público** | `POST /api/auth/signup` sem rate limit/captcha; cria organizações e usuários com `email_confirm: true` (e-mail não verificado — alguém pode registrar o e-mail de outra pessoa). | **MÉDIO** |
| **Recuperação de senha** | Sem rate limit; resposta uniforme (bom). | BAIXO |
| **Host header** | `siteUrl()` usa a origem da requisição se `NEXT_PUBLIC_SITE_URL` não estiver definido → quando houver envio real de e-mail, links poderiam apontar para um host forjado. | **MÉDIO** (latente) |
| **Permissões intra-escritório** | `activities` (com nomes de clientes/processos/documentos) visível a todos os membros, sem `*.view`; `notifications` reescrevíveis por qualquer membro. | **MÉDIO** / BAIXO |
| **Política de senha** | Regra "letras e números" só no cliente para troca/redefinição (o Supabase aplica apenas a própria configuração). | BAIXO |
| **Secrets** | `SUPABASE_SERVICE_ROLE_KEY` só no servidor (`getSupabaseAdmin` lança no navegador; sem `NEXT_PUBLIC_`). `.env*` ignorado pelo git (exceto `.env.example`). Chave pública do DataJud versionada no `.env.example` (documentada como pública). Todo `process.env` é repassado ao Python. | BAIXO |
| **Senha do Super Admin** | Em variável de ambiente; só usada na criação. | BAIXO |
| **SQL injection** | PostgREST com query builder; SQLite com parâmetros `?`; migração usa `format('%I', '%L')`. Nenhum SQL concatenado com entrada do usuário. | Não observado |
| **Command injection** | `spawn` sem shell, argv em array; entrada ≤ 32 chars, validada no Python. Um valor iniciado por `-` seria interpretado pelo `argparse` como opção (ex.: `--cache=...`), mas falharia por falta do argumento posicional. | BAIXO |
| **XSS** | React escapa texto; único `dangerouslySetInnerHTML` é o script de tema constante (`app/layout.tsx`). JSON bruto do DataJud exibido como texto em `<pre>`. Preview de PDF/imagem vem de URL assinada em domínio do Supabase. | BAIXO |
| **Bucket `avatars` público** | Tipo validado só no cliente (`AVATAR_TYPES`); o bucket não restringe MIME → um usuário poderia enviar HTML/SVG na própria pasta, servido pelo domínio do Supabase. | BAIXO |
| **Uploads de documentos** | Extensão desconhecida vira `.pdf`; sem verificação de conteúdo; limite 25 MB no bucket. | BAIXO |
| **SSRF** | URL do DataJud fixa; alias derivado de tabela interna. `fetch` do preview usa URL assinada gerada pelo Supabase. | Não observado |
| **CSRF** | Rotas mutáveis dependem de cookie de sessão; aceitam JSON. Não há token CSRF. A proteção efetiva depende do atributo SameSite dos cookies do `@supabase/ssr` (não definido no código do LEXA). | BAIXO / não determinado |
| **Webhooks** | Não existem. | N/A |
| **Exposição de dados na API** | Mensagens técnicas do Python (até 300 caracteres do corpo HTTP do DataJud) chegam ao navegador em `detail`. `route()` não vaza stack traces (500 genérico). | BAIXO |
| **Logs** | `console.info` de eventos DataJud com CNJ; `console.error` de erros. Sem logging estruturado/monitoramento. | BAIXO (além do item de links) |
| **Proxy** | Usa `getUser()` (valida no Supabase) em vez de `getSession()`; falha fechada sem env. `matcher` exclui estáticos por extensão. | (ponto forte) |
| **Open redirect** | `safeNext()` só aceita caminho iniciado por `/` e rejeita `//` e `/\`. | (ponto forte) |

---

## 27. Performance

| Problema | Onde | Por que pode ser problema | Impacto provável | Possível direção futura |
|---|---|---|---|---|
| Carga integral de todas as coleções | `loadState()` (`storage.ts`), chamado no mount de `DemoStoreProvider` | 10 tabelas, paginadas de 1.000 em 1.000, **tudo** do escritório (inclusive `activities`, que só cresce, e processos com `raw` de cada movimento) | Tempo de abertura e memória crescem linearmente com o histórico do escritório | Carregamento por módulo/página, paginação, projeções |
| Processo como documento gigante | `processes.data` com `movements[]` + `raw` | Qualquer alteração no processo (ex.: mudar o responsável) regrava o JSON inteiro com centenas de movimentações | Tráfego e latência de gravação altos; risco maior de sobrescrita concorrente | Tabela própria de movimentações |
| Contexto único | `useDemoData()` em 33 componentes | Toda mudança re-renderiza todos os consumidores | Lentidão perceptível com muitos dados | Contextos por coleção / seletores |
| Buscas O(N·M) no render | `documents-view.tsx`, `tasks-view.tsx` (`describeRelated`), `processes-view.tsx` (`clientName` com `find`), contagens | `find` dentro de `map/filter` a cada render | CPU no navegador com milhares de itens | `Map` por id memoizado |
| Python por requisição | `python-lookup.ts` | Inicia interpretador a cada consulta; processo pode durar até 5 min | Custo de CPU/memória; em serverless, função presa por minutos | Cliente HTTP em TS; fila |
| Retry longo | `datajud.py` (7 tentativas, backoff até 30 s, leitura 120 s) | Consulta pode levar minutos | UX lenta; conexões abertas | Limites menores/fila assíncrona |
| Cache por instância | SQLite em `.data/` | Cada instância/servidor tem seu cache; `--refresh` sempre ignora o cache | Pouco aproveitamento do cache em ambiente distribuído | Cache compartilhado |
| N+1 na gestão de membros | `listMembers()` (`members.ts`) | `auth.admin.getUserById` por membro | Lento com equipes grandes | Consulta em lote |
| Admin carrega todos os perfis | `GET /api/admin/organizations` | Todos os perfis de todos os escritórios, agrupados em memória | Cresce com a base de clientes do SaaS | Agregação no banco |
| Timeline de processo | `interpretMovements` com `WeakMap`; `ProcessTimeline` renderiza 60 por vez | — | (ponto forte) | — |
| Gravação agrupada | `persist` com debounce 300 ms + diff por identidade | Só envia o que mudou | (ponto forte) | — |
| Bundle | Recharts só em `financeiro/revenue-chart.tsx` e dashboard; framer-motion em muitos componentes; quase tudo `"use client"` | Todo o app é JS no cliente | Bundle inicial maior | Análise de bundle (não feita — `node_modules` ausente) |
| Imagens | Avatar via `<img>` de URL pública; preview via `<img>` | Sem `next/image` (há `eslint-disable`) | Baixo | — |
| Uploads | Direto do navegador ao Storage (não passa pelo Next) | — | (ponto forte: não ocupa o servidor) | — |

---

## 28. Arquivos críticos (maiores e mais centrais)

| Arquivo | Linhas | Responsabilidade | Por que cresceu (inferência) | Dependências | O que contém |
|---|---|---|---|---|---|
| `lib/store/demo-store.tsx` | 738 | Estado + **todas** as regras de negócio de escrita + persistência | Toda nova ação de negócio entra aqui | account, dates, format, services/processes, supabase client, storage | Tipos de input; `DemoActions` (25 métodos); `logActivity`; `nextProcessCode`; carga inicial; `persist`/fila/rollback; listeners de `pagehide`/`visibilitychange`; hooks `useDemoData`/`useDemoActions` |
| `components/configuracoes/members-manager.tsx` | 535 | Gestão de membros (Sócio e Super Admin) | Lista + convite + edição + permissões + reenvio + remoção num só arquivo | fetch, session, permissions | helper `call()`, formulários (`EditForm`, `PermissionsForm`, convite), lista, diálogos |
| `python/datajud.py` | 465 | Cliente DataJud | Resiliência (retry/429/parciais), cache, CLI, eventos | requests, sqlite3 | tribunais, erros, `Reporter`, `SQLiteCache`, CNJ, backoff, `DataJudClient`, `lookup`, `main` |
| `components/admin/admin-view.tsx` | 386 | Painel do Super Admin | CRUD de escritórios + aprovação + equipe | fetch, MembersManager | lista, criação, status/plano, sheet de equipe |
| `components/processos/process-profile.tsx` | 365 | Página do processo | Agrega processo, cliente, tarefas, docs, agenda, timeline | store, services, UI | **UI + derivação de dados + formatação** |
| `components/processos/new-process-dialog.tsx` | 361 | Cadastro/consulta de processo | Dois fluxos (manual e DataJud) no mesmo form | cnj, services/processes/client, store | **UI + validação + orquestração da consulta + regras de duplicidade + gravação** |
| `components/configuracoes/profile-section.tsx` | 346 | Perfil, foto, e-mail, senha, sessões | Várias sub-seções | supabase client, API me/email | chamadas diretas ao Supabase + formulários |
| `types/index.ts` | 304 | Contratos | Toda entidade | — | tipos |
| `supabase/migrations/0001_lexa_auth.sql` | 300 | Schema completo | Migração única | — | tabelas, funções, RLS, buckets |
| `lib/services/processes/movement-interpreter.ts` | 299 | Classificação/descrição de movimentos | Regras por nome/código/complemento | format | regras e interpretação |
| `components/tasks/tasks-view.tsx` | 309 | Página de tarefas | Lista, quadro, escopo, filtros, detalhe | store, selectors | UI + filtros + agrupamento |
| `components/clientes/clients-view.tsx` | 293 | Lista de clientes | Desktop + mobile + ações | store | UI + filtros |

Decomposição de `new-process-dialog.tsx` (exemplo pedido):

```
new-process-dialog.tsx
├── UI (modal, campos, feedback de consulta, log)
├── estado do formulário e da consulta (useState, AbortController)
├── validação (20 dígitos, DV, tipo ≥ 3, duplicidade por CNJ)
├── chamada de API (searchProcessByCNJ + eventos ao vivo)
├── regra de negócio (existe → applyProcessSync; novo → importProcess; ajuste → updateProcess)
└── mapeamento ficha → formulário (área, tipo, juízo, comarca, parte contrária)
```

---

## 29. Acoplamento

### 29.1 Cadeias de dependência observadas

```
Qualquer tela ──► useDemoData/useDemoActions ──► demo-store.tsx ──► storage.ts ──► tabelas Supabase (nomes fixos em TABLES)
                                                        │                               ▲
                                                        └──► lib/account.ts (singleton) ◄── SessionProvider
```

```
new-process-dialog ──► services/processes/client.ts ──► /api/processes/search ──► python-lookup.ts ──► datajud.py ──► DataJud
                                                                  └──► datajud/mapper.ts (import direto) ──► sheet.ts
```

```
Permissões: lib/auth/permissions.ts  ⇄  role_defaults (SQL)   (sincronia manual, protegida por teste)
Coleções:   types/index.ts ⇄ storage.ts (PersistedState, TABLES) ⇄ migração (lista de tabelas) ⇄ demo-store (initialState)
```

### 29.2 Pontos onde uma alteração quebra várias áreas

| Ponto | Por quê |
|---|---|
| `types/index.ts` | 52 arquivos importam; os dados em `jsonb` não são migrados — mudar o nome/forma de um campo deixa registros antigos inconsistentes sem erro |
| `lib/store/demo-store.tsx` | todas as telas dependem; ações registram atividades, ordenam arrays, e a persistência depende da imutabilidade (diff por identidade) — uma mutação in-place faria a mudança **não ser gravada** |
| `lib/store/storage.ts` (`TABLES`, `NEWEST_FIRST`, `APPEND_ONLY`) | acoplado à migração; nova coleção exige mudar 4 lugares |
| `lib/account.ts` | 31 arquivos; lança se usado fora do `SessionProvider` |
| `lib/auth/permissions.ts` | UI, rotas e teste de paridade com SQL |
| `components/layout/nav-config.ts` | menu, busca Ctrl+K e bloqueio de rota |
| `lib/dates.ts` (`parse`, `toLocalISO`) | formato "ISO local sem fuso" usado em todas as entidades |
| `lib/format.ts` (`fold`) | usado no **hash das movimentações** — mudar a normalização altera hashes e faz a próxima sincronização reimportar tudo (as movimentações antigas têm `hash` gravado) |
| `movement-interpreter.ts` | categorias e filtros da timeline |
| `proxy.ts` (`PUBLIC`, `matcher`) | toda a proteção de rotas |

### 29.3 Acoplamentos específicos

- **Componente → store** (não → API): nenhum componente de domínio chama o Supabase diretamente, exceto upload de documento/avatars e configurações (perfil, escritório).
- **Rotas de processo → DataJud diretamente** (sem camada de provider).
- **Processo ↔ movimentações** no mesmo documento.
- **IA → Gemini:** não se aplica.

---

## 30. Dívida técnica observada

| Categoria | Item | Onde |
|---|---|---|
| Nomes inconsistentes | `demo-store`, `useDemoData`, `useDemoActions`, `DemoState` para dados reais | `lib/store/demo-store.tsx` e 33+17 consumidores |
| Documentação desatualizada | README ("salvo no navegador", "Almeida & Associados"); comentários em `clientes/[id]/page.tsx`, `processos/[id]/page.tsx`, `processes-view.tsx`; `lookup-events`/`sync` falam "quando a persistência sair do browser" | vários |
| Campos nunca preenchidos | `Process.nextDeadline`; `Client.status` (sempre `novo`), `Client.lastActivityAt` (nunca atualizado), `source`, `contact`, `profession`, `birthDate`; `Process.caseId`; `Appointment.location`; `MovementDocument` (DataJud não fornece) | `types/index.ts` e views |
| Funcionalidade sem escrita | Faturas (sem criação/edição); notificações (sem criação); status `atrasado` não calculado | financeiro, notifications-menu |
| Mocks/simulações restantes | "Enviar cobrança" (2 lugares), "Exportar relatório", "Enviar lembrete" (WhatsApp), conexões de integração, preferências de notificação, "Salvar" genérico em configurações, "Usar arquivo de exemplo", e-mail (terminal) | settings-view, finance-view, finance-tab, appointment-detail, new-document-dialog, mailer |
| Textos fixos de data | hints "Quarta-feira, 23 set" etc. | `tasks-view.tsx` |
| Valores padrão regionais fixos | `district: "Comarca da Capital — Florianópolis"`; placeholder `(48)` | `new-process-dialog.tsx`, `new-client-dialog.tsx` |
| Inconsistência de comportamento | checkbox de tarefa não move coluna; texto "coluna anterior" vs. código "primeira coluna" | tasks |
| Faltas de CRUD | editar compromisso, editar processo no perfil, editar documento, editar status/nome/documento do cliente | vários |
| Duplicação | `isEmail`, `cap`, `call()`, lógica de atividade de conclusão, parsing nas rotas de processo | seção 4.2 |
| APIs inconsistentes | dois formatos de erro | seção 22 |
| Validação | sem schema (Zod etc.) nem no servidor nem na leitura do `jsonb` | geral |
| Integridade referencial | IDs em JSON sem FK; exclusões deixam órfãos | seção 7 |
| Concorrência | sem realtime, last-write-wins, código sequencial não atômico, colunas padrão duplicáveis, último sócio sem trava transacional | store, board-view, members |
| Migrações | arquivo único para "rodar uma vez"; sem ferramenta de migração/versionamento incremental | `supabase/migrations` |
| Dependências | `requests` sem `requirements.txt`; Prettier configurado mas não instalado | `python/`, `.prettierrc` |
| Testes | nenhum teste de componente, rota, RLS ou E2E | seção 31 |
| Segurança/performance | ver seções 26 e 27 | — |
| Error boundaries | só `app/(app)/error.tsx`; sem `global-error.tsx`; erro de carga inicial deixa o app em esqueleto | seção 26/abaixo |

### 30.1 Tratamento de erros (resumo classificado)

| Nível | Observação | Onde |
|---|---|---|
| ALTO | Gravação otimista: toast de sucesso antes da confirmação; em falha, **substitui todo o estado** pelo servidor (perde alterações posteriores não gravadas) | `demo-store.tsx` → `persist` |
| MÉDIO | Falha em `loadState` inicial: só `console.error` + toast; `hydrated` fica `false` → telas presas no esqueleto até recarregar | `demo-store.tsx` |
| MÉDIO | `loadSession` ignora `error` das consultas: falha de rede ao ler o perfil vira "Sua conta não está vinculada a nenhum escritório" | `lib/auth/session.tsx` |
| MÉDIO | Upload OK + metadados negados → arquivo órfão | `new-document-dialog.tsx` + store |
| BAIXO | Erro ao remover arquivo do Storage ignorado | `storage.ts` (`remove` sem checar retorno) |
| BAIXO | Erros silenciosos intencionais (`clipboard.catch(() => {})`, `try {} catch {}` no stream) | vários |
| BAIXO | Sem logging estruturado/monitoramento; tudo em `console.*` | servidor |
| (bom) | `route()` padroniza erros e esconde detalhes; mensagens de erro do DataJud centralizadas e amigáveis; `ErrorState` com "Tentar de novo" no boundary do app | `lib/auth/server.ts`, `errors.ts`, `app/(app)/error.tsx` |

---

## 31. Testes

### 31.1 Configuração

- Script: `"test": "node --test --import ./tests/register.mjs \"lib/**/*.test.ts\""`.
- Node roda `.ts` direto (type stripping nativo — executado aqui com Node 22.22.2). `tests/register.mjs` registra `tests/resolver.mjs`, que resolve o alias `@/` e imports sem extensão.
- Sem Jest/Vitest/Playwright/Testing Library. Sem cobertura configurada. Sem CI.
- **Resultado da execução (somente leitura):** 18 suítes, **80 testes, 80 passando**, ~1 s.

### 31.2 O que é coberto

| Arquivo de teste | Cobre |
|---|---|
| `lib/cnj.test.ts` | máscara, formatação, validação de DV, tamanho |
| `lib/integrations/legal/datajud/mapper.test.ts` (15 casos) | mapeamento de respostas DataJud (fixtures em `__fixtures__/responses.ts`) |
| `lib/services/processes/movements.test.ts` | hash determinístico/normalizado, deduplicação, movimentos sem hash, repetição na mesma resposta, paridade ficha × modelo externo |
| `lib/services/processes/movement-interpreter.test.ts` | 13 cenários de classificação + preservação de dados + complementos + cadastro manual + memoização |
| `lib/services/processes/movement-timeline.test.ts` | agrupamento por dia, clusters, plural |
| `lib/selectors.test.ts` | finanças (vazio, meses, previsto × recebido, inadimplência, por área) |
| `lib/store/storage.test.ts` | `diffState`/`diffCollection`/`orderCollection` |
| `lib/auth/permissions.test.ts` | **paridade `ROLE_DEFAULTS` × `role_defaults` do SQL**, regras de `hasPermission`/`sanitizePermissions` |

### 31.3 Principais gaps

- **Nenhum teste de componente React** (formulários, validações de UI, Kanban).
- **Nenhum teste das ações do store** (`addClient`, `importProcess`, `applyProcessSync`, `moveTask`, `deleteTaskColumn`, rollback de `persist`).
- **Nenhum teste de rota de API** (auth, team, admin, processos) nem de `members.ts` (regras de último sócio, auto-alteração).
- **Nenhum teste das políticas RLS/Storage** (isolamento entre escritórios é a peça de segurança mais importante e não tem teste automatizado).
- **Nenhum teste do `python/datajud.py`** (retry, 429, respostas parciais, cache).
- **Nenhum teste de `python-lookup.ts`** (timeout, abort, spawn inexistente).
- **Nenhum E2E** (login → cadastro → consulta CNJ).
- `sheet.ts`/`import.ts` são cobertos só indiretamente.

---

## 32. Deploy

### 32.1 O que está configurado

| Item | Observado |
|---|---|
| Plataforma | **Não configurada explicitamente.** Não há `vercel.json`, Dockerfile, CI (`.github/`) ou scripts de deploy. O `.gitignore` ignora `.vercel`, o que sugere uso previsto da Vercel. |
| Build | `next build`; `next start` |
| `next.config.ts` | `devIndicators: false`; `outputFileTracingIncludes: { "/api/processes/**": ["./python/**/*.py"] }` (inclui o script Python no pacote das rotas) |
| Runtime das rotas de processo | `runtime = "nodejs"`, `dynamic = "force-dynamic"` |
| Start hook | `instrumentation.ts` → `ensureSuperAdmin()` (só no runtime Node) |
| Banco | Supabase; **migração manual** (colar `0001_lexa_auth.sql` no SQL Editor, uma vez, projeto vazio). Sem Supabase CLI config, sem migrações incrementais. |
| Storage | buckets criados pela própria migração |
| Serviços externos | Supabase; DataJud |
| Webhooks / jobs / cron | Nenhum |
| Dev | `.claude/launch.json` (`next dev -p 3100`) |

### 32.2 Variáveis de ambiente

| Variável | Onde é lida | Obrigatória | Exposta ao navegador |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | clientes Supabase, `proxy.ts`, bootstrap | Sim | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem | Sim | Sim (protegida pela RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts`, bootstrap | Sim (rotas de servidor) | **Não** |
| `LEXA_SUPERADMIN_EMAIL` / `LEXA_SUPERADMIN_PASSWORD` | `lib/auth/bootstrap.ts` | Para ter Super Admin | Não |
| `NEXT_PUBLIC_SITE_URL` | `siteUrl()` | Opcional (recomendado) | Sim |
| `DATAJUD_API_KEY` | `python/datajud.py` | Para consulta | Não |
| `PYTHON_BIN`, `DATAJUD_PYTHON_TIMEOUT_MS` | `python-lookup.ts` | Opcionais | Não |

### 32.3 Caminho "git push → runtime"

**Não há pipeline configurado no repositório**, então o caminho abaixo é o que o código **exige**, não algo automatizado:

```
git push
  ↓ (plataforma não definida no repo — possivelmente Vercel)
next build   (inclui python/*.py nas funções /api/processes/** via outputFileTracingIncludes)
  ↓
runtime Node
  ├─ instrumentation.register() → ensureSuperAdmin() (service role)
  ├─ proxy.ts em cada requisição → Supabase Auth
  ├─ páginas/JS no navegador → Supabase (PostgREST/Storage) direto
  └─ /api/processes/** → spawn("python3") → DataJud ; cache em ./.data/
  ↓
Supabase (schema aplicado manualmente)
```

**Potenciais riscos de produção (inferência):**
- Em hospedagem serverless (ex.: Vercel Functions Node), **não há garantia de interpretador Python com `requests`** disponível para `spawn`; e o diretório do projeto costuma ser somente leitura, o que faria `SQLiteCache` falhar ao criar `.data/` (exceção não tratada como `DataJudError` → processo termina sem resultado → `UNEXPECTED`). Não foi possível confirmar pelo código qual é o ambiente de produção.
- Consultas de até 5 min podem exceder limites de duração de funções serverless.
- `instrumentation.ts` roda a cada *cold start* (a função é idempotente).
- E-mails não são enviados (links só no log).

---

## 33. Diagrama completo

```
                                   ┌──────────────────────────┐
                                   │        Navegador         │
                                   │  React 19 (quase tudo    │
                                   │  "use client")           │
                                   └────────────┬─────────────┘
                                                │
                     ┌──────────────────────────┼─────────────────────────────┐
                     │                          │                             │
             ┌───────▼────────┐        ┌────────▼─────────┐          ┌────────▼────────┐
             │ SessionProvider│        │ DemoStoreProvider │          │   UIProvider    │
             │ (conta, can()) │        │ (dados + regras)  │          │ (diálogos, ⌘K)  │
             └───────┬────────┘        └────────┬──────────┘          └─────────────────┘
                     │                          │
   ┌────────┬────────┼─────────┬────────┬───────┼────────┬──────────┬──────────┐
   │        │        │         │        │       │        │          │          │
Dashboard Clientes Processos Tarefas  Agenda Documentos Financeiro Configur.  (Admin)
   │        │        │ │       │        │       │  │     (leitura)  │  │        │
   │        │        │ └─ consulta CNJ ─┼───────┼──┼────────────────┼──┼──┐     │
   └────────┴────────┴─────────┴────────┴───────┘  │                │  │  │     │
                          │  store: diff + upsert  │ upload/preview │  │  │     │
                          ▼                        ▼                │  │  │     │
            ┌─────────────────────────────────────────────────┐     │  │  │     │
            │                   SUPABASE                       │◄────┘  │  │     │
            │  Auth (cookies)                                  │        │  │     │
            │  Postgres + RLS: organizations, profiles,        │        │  │     │
            │   clients, processes(+movements), tasks,         │        │  │     │
            │   task_columns, appointments, appointment_       │        │  │     │
            │   categories, documents, invoices, activities,   │        │  │     │
            │   notifications                                  │        │  │     │
            │  Storage: avatars (público), documents (privado) │        │  │     │
            └───────────────────────▲─────────────────────────┘        │  │     │
                                    │ service role                     │  │     │
            ┌───────────────────────┴─────────────────────────┐        │  │     │
            │              SERVIDOR NEXT.JS                    │◄───────┘  │     │
            │ proxy.ts (sessão)                                │  team/me  │     │
            │ /api/auth/* · /api/team/* · /api/me/email        │◄──────────┘     │
            │ /api/admin/* ◄───────────────────────────────────┼─────────────────┘
            │ /api/processes/search | [id]/sync ◄──────────────┼── (consulta CNJ)
            │        │ spawn                                   │
            └────────┼─────────────────────────────────────────┘
                     ▼
            ┌──────────────────┐        HTTPS         ┌───────────────────────────┐
            │ python/datajud.py│ ───────────────────► │ DataJud (API Pública CNJ) │
            │ + SQLite cache   │                      └───────────────────────────┘
            └──────────────────┘

   Não existem: Gemini/IA · WhatsApp (só simulação na UI) · e-mail real (log) · jobs/cron · webhooks
```

---

## 34. Modelo mental do LEXA

**"O que é o LEXA tecnicamente?"**
Um app Next.js que se comporta como uma SPA: o navegador baixa **todos** os dados do escritório do Supabase ao entrar, trabalha em memória e devolve as mudanças ao Supabase em segundo plano. O servidor Next é um coadjuvante — protege rotas, faz o que exige segredo (service role, chave do DataJud) e roda o Python.

**"Qual é o núcleo do sistema?"**
Três arquivos: `lib/store/demo-store.tsx` (o que acontece quando o usuário age), `lib/store/storage.ts` (como isso vira linhas no banco) e `supabase/migrations/0001_lexa_auth.sql` (quem pode ver/gravar o quê). Em volta deles, `types/index.ts` define a forma dos dados e `lib/auth/session.tsx` + `lib/account.ts` dizem "quem sou eu e de que escritório".

**"Quais são os principais domínios?"**
Escritório/pessoas (auth), Clientes, Processos (com movimentações), Tarefas (com colunas), Agenda (com categorias), Documentos, Financeiro (faturas, só leitura), Atividades (histórico) e Notificações (estrutura).

**"Como eles se relacionam?"**
Tudo pertence a um **escritório**. O **cliente** é o centro das ligações: processos, compromissos, documentos e faturas apontam para ele por `clientId`; tarefas apontam para cliente **ou** processo (`related`). Essas ligações são IDs dentro do JSON — o banco não as conhece, a UI resolve com `find`.

**"Qual é o caminho normal dos dados?"**

```
Supabase ──loadState()──► store em memória ──useDemoData()──► telas
telas ──useDemoActions().x()──► store (imutável) ──diffState──► syncState ──► Supabase
```

A exceção é a consulta processual: `tela → /api/processes/* → Python → DataJud → ficha → store → Supabase`.

**"Quais partes são frontend?"** `components/**`, `lib/store/**`, `lib/selectors.ts`, `lib/dates.ts`, `lib/format.ts`, `lib/config.ts`, `lib/masks.ts`, `lib/documents.ts`, `lib/auth/session.tsx`, `lib/account.ts`, `lib/services/processes/{client,import,movement-interpreter,movement-timeline}.ts`.

**"Quais partes são backend?"** `proxy.ts`, `instrumentation.ts`, `app/api/**`, `app/auth/confirm`, `app/(admin)/layout.tsx`, `lib/auth/{server,members,bootstrap,mailer}.ts`, `lib/supabase/{server,admin}.ts`, `lib/services/processes/python-lookup.ts`, `lib/integrations/**` (executado nas rotas), `python/datajud.py` e o próprio Supabase (RLS).

**"Qual é a fonte da verdade?"** O **Postgres do Supabase** (e o Storage para arquivos). O store em memória é uma cópia que pode estar desatualizada em relação ao que colegas gravaram. O cache SQLite é só otimização.

**"Onde ficam as regras de negócio?"**
- De **acesso** (quem vê/grava): no SQL (RLS, `has_perm`) e em `lib/auth/*`.
- De **domínio** (o que acontece ao criar/mover/sincronizar): em `lib/store/demo-store.tsx`.
- De **validação de formulário**: dentro de cada `*-dialog.tsx`/`*-form.tsx`.
- De **processo judicial** (normalização, dedupe, interpretação): `lib/integrations/legal/**` e `lib/services/processes/**`.
- De **cálculo** (finanças, buckets de tarefa): `lib/selectors.ts`.

**"Onde eu deveria procurar se quiser alterar X?"** → seção 35.

**Três armadilhas para um dev novo:**
1. **Nunca mutar o estado do store in-place.** A persistência compara por identidade (`before.get(id) !== item`); um objeto mutado não é detectado e **não é gravado**.
2. **Esconder um botão não é segurança.** Se uma regra importa, ela precisa estar na RLS ou numa rota de servidor.
3. **Mudar `types/index.ts` não migra dados.** O `jsonb` antigo continua com a forma antiga.

---

## 35. Guia: onde alterar cada funcionalidade

| Se eu quiser alterar… | Arquivos |
|---|---|
| **Clientes** | `components/clientes/clients-view.tsx`, `new-client-dialog.tsx`, `profile/*.tsx`; ações `addClient/updateClient/deleteClient` em `lib/store/demo-store.tsx`; tipo `Client` em `types/index.ts`; status/tons em `lib/config.ts` (`CLIENT_STATUS`); máscaras em `lib/masks.ts`; RLS da tabela `clients` na migração |
| **Processos** | `components/processos/processes-view.tsx`, `process-profile.tsx`, `new-process-dialog.tsx`, `process-source-panel.tsx`; ações `addProcess/updateProcess/importProcess/applyProcessSync/deleteProcess`; `lib/services/processes/import.ts`; `lib/cnj.ts`; `PROCESS_STATUS` em `lib/config.ts`; tipo `Process` |
| **Movimentações** | Interpretação: `lib/services/processes/movement-interpreter.ts`; agrupamento: `movement-timeline.ts`; dedupe/hash: `movements.ts` (cuidado: muda hashes); exibição: `components/processos/process-timeline.tsx`, `movement-detail-sheet.tsx`; tipo `ProcessMovement` |
| **Tarefas** | `components/tasks/*` (lista: `tasks-view.tsx`, `task-item.tsx`; Kanban: `board-view.tsx`, `task-card.tsx`; form: `task-form-dialog.tsx`; detalhe: `task-detail-sheet.tsx`); ações `addTask/updateTask/toggleTask/moveTask/deleteTask/*TaskColumn`; buckets em `lib/selectors.ts`; `PRIORITY_CONFIG` em `lib/config.ts` |
| **Agenda** | `components/agenda/*` (`agenda-view.tsx`, `time-grid.tsx`, `month-grid.tsx`, `new-appointment-dialog.tsx`, `appointment-detail.tsx`, `category-picker.tsx`, `use-category.ts`, `layout-events.ts`); ações `addAppointment/deleteAppointment/*AppointmentCategory`; paleta `CATEGORY_COLORS` em `lib/config.ts` |
| **Documentos** | `components/documentos/documents-view.tsx`, `new-document-dialog.tsx`; `components/shared/document-list.tsx`, `document-preview-sheet.tsx`, `file-icon.tsx`; `lib/documents.ts`; ações `addDocument/deleteDocument`; remoção de arquivo em `lib/store/storage.ts`; bucket/políticas na migração |
| **Financeiro** | `components/financeiro/finance-view.tsx`, `revenue-chart.tsx`; `components/clientes/profile/finance-tab.tsx`; cálculos em `lib/selectors.ts`; `INVOICE_STATUS` em `lib/config.ts`; tipo `Invoice` (**não há ações de escrita — seria preciso criá-las em `demo-store.tsx`**) |
| **Dashboard** | `components/dashboard/*` (`dashboard-view.tsx`, `kpi-cards.tsx`, `greeting.tsx`, `my-tasks.tsx`, `today-agenda.tsx`, `recent-activity.tsx`, `revenue-panel.tsx`); seletores em `lib/selectors.ts` |
| **Gemini / IA** | Não existe. Por analogia: nova rota em `app/api/…` com `requireMember()`; chave só no servidor; componente em `components/…`; registro no `nav-config.ts` se for tela |
| **DataJud** | `python/datajud.py` (HTTP, retry, cache, tribunais); `lib/services/processes/python-lookup.ts` (processo filho/timeout); `app/api/processes/search/route.ts`, `[id]/sync/route.ts`; `lib/integrations/legal/datajud/mapper.ts`, `errors.ts`; `lib/services/processes/lookup-events.ts` (log) e `sheet.ts` |
| **WhatsApp** | Não existe. Pontos simulados: `components/configuracoes/settings-view.tsx`, `components/agenda/appointment-detail.tsx`, `components/financeiro/finance-view.tsx` |
| **Autenticação** | `proxy.ts`; `components/auth/*`; `app/(auth)/*`; `app/auth/confirm/route.ts`; `app/api/auth/*`; `lib/auth/session.tsx`, `server.ts`, `validation.ts`, `navigate.ts`, `mailer.ts` (envio de e-mail), `bootstrap.ts`; `lib/supabase/*` |
| **Banco** | `supabase/migrations/0001_lexa_auth.sql` (+ nova migração); `lib/store/storage.ts` (`PersistedState`, `TABLES`, `NEWEST_FIRST`, `APPEND_ONLY`); `types/index.ts`; `initialState` em `demo-store.tsx`; `lib/auth/profile.ts` (mapeamento de linhas relacionais) |
| **Permissões** | `lib/auth/permissions.ts` **e** `role_defaults` no SQL (o teste `permissions.test.ts` exige paridade); `components/layout/nav-config.ts` (rota); `DIALOG_PERMISSION` em `lib/store/ui-store.tsx`; `<Can>`/`can()` nas telas; políticas RLS; `components/configuracoes/permissions-section.tsx`, `members-manager.tsx`; `lib/auth/members.ts` |
| **Layout global** | `app/layout.tsx`, `app/globals.css` (tokens de cor), `components/providers.tsx`, `app/(app)/layout.tsx`, `components/layout/app-shell.tsx`, `sidebar.tsx`, `sidebar-nav.tsx`, `topbar.tsx`, `mobile-nav.tsx`, `nav-config.ts`, `command-menu.tsx`, `global-dialogs.tsx`, `user-menu.tsx`, `notifications-menu.tsx`, `logo.tsx`; design system em `components/ui/*`; tema em `lib/theme.tsx`/`theme-script.ts` |
| **Configurações** | `components/configuracoes/settings-view.tsx` (seções por `?secao=`), `profile-section.tsx`, `office-section.tsx`, `members-manager.tsx`, `permissions-section.tsx` |
| **Super Admin** | `app/(admin)/*`, `components/admin/admin-view.tsx`, `app/api/admin/**`, `lib/auth/server.ts` (`requireSuperAdmin`) |
| **Datas/formatos** | `lib/dates.ts` (sempre `getNow()`), `lib/format.ts`, `lib/masks.ts` |

---

## 36. Guia: arquivos críticos ("onde não mexer" sem cuidado)

| Arquivo | Responsabilidades | Quem depende | Risco de alteração |
|---|---|---|---|
| `supabase/migrations/0001_lexa_auth.sql` | schema, RLS, funções de autorização, buckets | todo o sistema | **Muito alto**: erro em política = vazamento entre escritórios ou app sem dados. O arquivo não é incremental — mudanças em produção exigem nova migração |
| `lib/store/demo-store.tsx` | estado, regras, persistência, rollback | 33 leitores, 17 escritores | **Muito alto**: mutação in-place não é gravada; mudança em `persist` pode perder dados |
| `lib/store/storage.ts` | carga/diff/gravação/remoção de arquivos | store | **Alto**: `diffCollection` por identidade; `TABLES` precisa bater com o banco |
| `types/index.ts` | contratos | 52 arquivos | **Alto**: dados antigos em `jsonb` não migram |
| `proxy.ts` | proteção de rotas e renovação de sessão | todas as requisições | **Alto**: `PUBLIC`/`matcher` errados expõem ou bloqueiam tudo |
| `lib/auth/server.ts` | `requireMember`, `requireSuperAdmin`, `route` | todas as rotas | **Alto** |
| `lib/auth/permissions.ts` | papéis/permissões | UI + rotas + teste de paridade | **Alto** (manter igual ao SQL) |
| `lib/auth/session.tsx` + `lib/account.ts` | quem é o usuário/escritório | 30+31 arquivos; store | **Alto**: ordem de providers; `account.*` fora da árvore lança erro |
| `lib/supabase/admin.ts` | service role | rotas de servidor | **Alto**: nunca importar no cliente |
| `lib/services/processes/movements.ts` + `lib/format.ts` (`fold`) | identidade de movimentações | sync/importação | **Alto**: mudar hash/normalização → reimportação duplicada |
| `lib/integrations/legal/datajud/mapper.ts` | fronteira DataJud | rotas | Médio (bem testado) |
| `python/datajud.py` | HTTP com DataJud | rotas | Médio: códigos de erro precisam bater com `errors.ts` |
| `components/layout/nav-config.ts` | menu + permissão de rota | shell, busca | Médio |
| `components/layout/global-dialogs.tsx` + `lib/store/ui-store.tsx` | diálogos globais | 24 chamadas `openDialog` | Médio |
| `lib/dates.ts` | formato de data do sistema | quase todas as telas | Médio |
| `app/(app)/layout.tsx` | ordem Session → Store → Shell | app inteiro | Alto |

---

## 37. Glossário técnico

| Termo | Significado no LEXA |
|---|---|
| **App Router** | Sistema de rotas do Next.js baseado na pasta `app/`. Pastas entre parênteses (`(app)`, `(auth)`, `(admin)`) são *route groups* — organizam layouts sem aparecer na URL |
| **Página fina** | `page.tsx` que só define `metadata` e renderiza uma View client |
| **Server Component / Client Component** | Componente renderizado no servidor (padrão) vs. no navegador (`"use client"`). No LEXA, quase toda UI é client |
| **Route Handler / API Route** | `app/api/**/route.ts` exportando `GET/POST/PATCH/DELETE` |
| **Server Action** | Função `"use server"` chamada pelo cliente — **não usada** no LEXA |
| **Proxy** | `proxy.ts`: o equivalente, no Next 16, ao antigo `middleware.ts`; roda antes de cada requisição |
| **Instrumentation** | `instrumentation.ts`: hook executado no start do servidor |
| **Provider / Context** | Componente React que disponibiliza estado via Context (`SessionProvider`, `DemoStoreProvider`, `UIProvider`) |
| **Store** | O estado de dados do escritório em memória (`demo-store.tsx`) |
| **Hook** | Função React `use*` (`useDemoData`, `useSession`, `useUI`, `useCategoryLookup`, `useToggleTask`, `useElapsed`) |
| **Selector** | Função pura que deriva dados do estado (`lib/selectors.ts`) |
| **Service** | Aqui, módulos de lógica pura em `lib/services/processes/` (não há camada "service" de CRUD) |
| **Integration / Provider (processual)** | Fonte externa de dados processuais; hoje só `datajud` (`lib/integrations/legal/`) |
| **Mapper** | Tradutor do formato bruto do provider para `ExternalProcess` |
| **Ficha (`ProcessSheet`)** | Modelo intermediário e neutro do processo que sai da API para o navegador |
| **Draft (`ProcessDraft`)** | Processo quase pronto, sem `id`/`code`/`organizationId` |
| **Movimentação / `LexaMovement`** | Evento do processo; `LexaMovement` é a versão interpretada para exibição |
| **TPU / complementos tabelados** | Tabela Processual Unificada do CNJ; complementos (`tipo_de_documento` → "Certidão") |
| **CNJ** | Número único do processo, 20 dígitos, `NNNNNNN-DD.AAAA.J.TR.OOOO`, DV MOD 97-10 |
| **J.TR / alias** | Segmento de justiça + tribunal no CNJ → índice `api_publica_<sigla>` do DataJud |
| **NDJSON** | JSON delimitado por quebra de linha, usado no stream de eventos da consulta |
| **Hash de movimentação** | Identidade de conteúdo (FNV-1a duplo) para não importar a mesma movimentação duas vezes |
| **Hidratação (`hydrated`)** | Flag do store: dados do escritório terminaram de carregar do banco (não confundir com hidratação do React) |
| **Diff / sync** | `diffState` calcula o que mudou; `syncState` grava (upsert/delete) |
| **Tenant / escritório** | `organizations.id`; cada pessoa pertence a um |
| **RLS** | Row Level Security do Postgres: políticas que filtram linhas por usuário |
| **`security definer`** | Função SQL que roda com privilégios do dono (usada para ler `profiles` sem recursão de RLS) |
| **Service role** | Chave do Supabase que ignora RLS; só no servidor |
| **Anon key** | Chave pública do Supabase usada no navegador; limitada pela RLS |
| **PostgREST** | API REST automática do Supabase sobre as tabelas |
| **URL assinada** | Link temporário (5 min) para um arquivo privado do Storage |
| **Super Admin** | Administrador do LEXA (sem escritório) que aprova/gerencia escritórios |
| **Sócio / Advogado / Colaborador** | `owner` / `lawyer` / `staff` |
| **`can()` / `<Can>`** | Checagem de permissão **visual** no cliente |
| **Schema** | Aqui: schema SQL da migração. Não há schemas de validação (Zod/Yup) |
| **ORM** | Não usado; acesso via query builder do supabase-js |

---

## 38. Conclusão

O LEXA tem uma arquitetura **"cliente gordo + banco com RLS"**: o navegador concentra estado e regras de domínio, o Supabase garante isolamento e permissões, e o servidor Next.js cuida só do que precisa de segredo (service role, DataJud). Essa escolha é coerente com a história visível no código (um store de demonstração que passou a persistir no Supabase) e tem vantagens reais — pouco código de servidor, isolamento multi-tenant bem feito na camada certa, UX instantânea (otimista) — mas também define os limites atuais:

1. **Escala de dados:** tudo é carregado de uma vez e cada processo é um documento com todo o histórico.
2. **Integridade:** regras de negócio e validação só existem no navegador; o banco aceita qualquer JSON de quem tem permissão de edição.
3. **Colaboração:** sem realtime e com last-write-wins por entidade inteira.
4. **Operação:** DataJud depende de Python + SQLite no mesmo host do Next, sem limite de concorrência; e-mail ainda não existe (links com token em log).
5. **Completude:** Financeiro e Notificações são só leitura/estrutura; prazos de processo nunca são preenchidos; WhatsApp e IA ainda não existem.

As partes mais maduras — e que servem de modelo para expandir — são o **pipeline processual** (`lib/integrations/legal` → `lib/services/processes`), com fronteira de provider, preservação do dado bruto, cuidado com fuso horário e testes, e o **modelo de autorização** (RLS + `has_perm` + GRANT por coluna + helpers de rota + teste de paridade TS×SQL). Para expandir o sistema (novas entidades, IA, WhatsApp, lançamentos financeiros), o caminho de menor atrito é seguir esses dois padrões: tipo em `types/index.ts` → tabela com `organization_id` + RLS na migração → coleção em `storage.ts` → ação no store (ou rota de servidor, quando envolver segredo, validação obrigatória ou integração externa).

---

*Relatório gerado por análise estática. Nenhum arquivo do projeto foi modificado além da criação deste documento.*
