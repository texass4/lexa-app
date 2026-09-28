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
lib/services/processes/client.ts          browser → API (NDJSON ao vivo)
    ↓
app/api/processes/search | [id]/sync      servidor
    ↓
python/datajud.py                          HTTP com o DataJud: retry, 429, cache SQLite
    ↓
datajud/mapper.ts → sheet.ts → import.ts   JSON bruto → ficha → processo do LEXA
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
│   └── api/                  processes/* (DataJud), auth/* (cadastro, recuperação),
│                             team/users (gestão do escritório), me/email, admin/*
├── components/
│   ├── layout/               sidebar, topbar, busca Ctrl K, notificações, modais globais
│   ├── ui/                   design system
│   ├── shared/               peças usadas em mais de um módulo
│   ├── processos/            lista, perfil, timeline, formulário com consulta CNJ
│   └── clientes/ tasks/ agenda/ documentos/ financeiro/ dashboard/ configuracoes/
├── lib/
│   ├── cnj.ts                máscara, normalização e dígito verificador
│   ├── integrations/legal/   modelo neutro (types.ts) + DataJud (mapper, mensagens de erro)
│   ├── services/processes/   ficha, importação, deduplicação, interpretação de movimentos
│   ├── auth/                 permissões, sessão, helpers de rota, gestão de membros
│   ├── supabase/             clientes: navegador, servidor (cookie) e admin (service role)
│   ├── store/                demo-store, ui-store, storage (persistência no Supabase)
│   ├── account.ts            pessoa e escritório logados (preenchido pela sessão)
│   ├── config.ts             labels, cores de status e paleta das categorias
│   ├── selectors.ts          consultas derivadas (inclui o financeiro, calculado das faturas)
│   ├── dates.ts              `getNow()` + formatadores
│   └── format.ts             moeda, busca, normalização de texto, IDs
├── python/datajud.py         cliente do DataJud (usado pelas rotas; roda sozinho no terminal)
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
| `/admin` … | Lexa Admin (Super Admin) — veja a seção 7 |

Menu lateral e título do header: `components/layout/nav-config.ts`. Barra inferior do mobile: `mobile-nav.tsx`.

---

## 3. Processos (dados reais)

Não há processos fictícios. Todo processo vem de uma consulta ao DataJud ou de cadastro manual.

**Consultar** — "Novo processo" → digitar o CNJ → **Preencher**:

1. `new-process-dialog.tsx` chama `searchProcessByCNJ` (`lib/services/processes/client.ts`).
2. `POST /api/processes/search` executa `python/datajud.py --events` e repassa cada evento (tentativa, HTTP 429, resposta parcial, timeout) em NDJSON — o formulário mostra o log ao vivo (`lookup-log.tsx`).
3. A resposta vira ficha (`mapper.ts` → `sheet.ts`) e o processo é **salvo na hora** (`importProcess`). Se o CNJ já existe, ele é atualizado (`applyProcessSync`), nunca duplicado.

**Atualizar** — botão no perfil → `POST /api/processes/[id]/sync` → `datajud.py --refresh` (ignora o cache) → só movimentações novas entram (hash em `movements.ts`).

**Persistência** — veja a seção 4.

**Timeline** — movimentação bruta → `ProcessMovement` (fatos da fonte + `raw`) → `movement-interpreter.ts` (categoria, título, descrição legível) → `movement-timeline.ts` (dias e agrupamento visual) → `process-timeline.tsx` + `movement-detail-sheet.tsx`.

Detalhes do DataJud que valem lembrar:
- Em `complementosTabelados`, `descricao` é a chave técnica (`tipo_de_documento`) e `nome` é o texto legível (`Certidão`).
- Sob carga, o DataJud responde **200 com shards falhos e sem resultados**. O `datajud.py` trata isso como falha temporária e tenta de novo — não como "não encontrado".
- Só processos encontrados vão para o cache (`.data/datajud_cache.db`, 6 h).

Variáveis de ambiente: veja `.env.example` (`DATAJUD_API_KEY`, e opcionalmente `PYTHON_BIN`, `DATAJUD_PYTHON_TIMEOUT_MS`).

---

## 4. Store, persistência e dados

```ts
const data = useDemoData()          // clients, processes, tasks, taskColumns, appointments…, hydrated
const { addTask, importProcess } = useDemoActions()
```

- **Os dados moram no Supabase.** Cada coleção é uma tabela (`organization_id`, `id`, `data jsonb`). `lib/store/storage.ts` carrega o que a RLS deixa a pessoa ver e grava só o que mudou (`diffState`, comparando por identidade — o store é imutável). A gravação é agrupada (300 ms) e em fila; se o banco recusar (sem permissão, falha), aparece um aviso e a tela recarrega o que está salvo.
- `hydrated` fica `true` quando os dados do escritório terminam de carregar. As telas mostram esqueleto só até lá.
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

`app/layout.tsx` → `Providers` (tema, stores, toasts) → `app/(app)/layout.tsx` → `AppShell` (sidebar, topbar, busca, modais).

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

## 7. Lexa Admin (`/admin`)

Centro de controle do Super Admin, com shell próprio (barra lateral escura, busca `Ctrl K`, pendências, perfil, botão para o CRM).

| URL | Tela | API |
|---|---|---|
| `/admin` | `components/admin/dashboard/dashboard-view.tsx` | `GET /api/admin/overview?from&to` |
| `/admin/escritorios`, `/[id]` | `components/admin/organizations/*` | `/api/admin/organizations[/id[/users…]]` |
| `/admin/usuarios` | `components/admin/users/users-view.tsx` | `GET /api/admin/users`, `PATCH /api/admin/users/[id]` (mover) |
| `/admin/planos` | `components/admin/plans/plans-view.tsx` | `/api/admin/plans[/id]` |
| `/admin/uso` | `components/admin/usage/usage-view.tsx` | `GET /api/admin/organizations` |
| `/admin/financeiro` | `components/admin/finance/finance-view.tsx` | `GET /api/admin/finance` |
| `/admin/atividade` | `components/admin/audit/audit-view.tsx` | `GET /api/admin/audit` |
| `/admin/configuracoes` | `components/admin/settings/settings-view.tsx` | `GET/PUT /api/admin/settings` |

Também: `/api/admin/search` (busca global), `/api/admin/notifications` (sino e contadores do menu), `/api/auth/events` (login/logout na auditoria).

**Segurança** — `app/(admin)/layout.tsx` confere o papel no servidor antes de renderizar; e toda rota `/api/admin/*` começa com `requireAdmin()` (`lib/admin/guard.ts`: sessão validada no Supabase + `super_admin` ativo + mesma origem nas alterações). As páginas não têm dados no HTML: tudo vem da API, então navegar sem recarregar não pula a checagem. Service role só no servidor.

**Dados** — `lib/admin/data.ts` (leituras), `lib/admin/catalog.ts` (tipos e regras puras: limites, alertas, períodos, formatação — testado), `lib/admin/settings.ts` (configurações e padrões), `lib/admin/audit.ts` (`recordAudit`, nunca derruba a ação), `lib/admin/usage.ts` (`recordUsage` para WhatsApp/IA). O Super Admin vê contagens, tamanhos, datas e quem acessou — nunca o conteúdo jurídico (as funções SQL agregam; a atividade do CRM sai só com tipo, autor e hora).

**Banco** (`0003_lexa_admin.sql`) — `plans` (catálogo; `organizations.plan` é FK pelo nome, renomear propaga), `subscriptions` (estado de cobrança; nasce em teste por trigger), `payments` (vazia até o gateway), `audit_logs` (só inserção), `usage_events`, `platform_settings`; status `suspended`; `current_org_id()` passa a respeitar o modo manutenção (bloqueio real, na RLS). Tabelas administrativas: RLS ligada e nenhuma política — o navegador não lê nem grava.

**Regras aplicadas de verdade** — manutenção (RLS + `requireMember`), cadastro público aberto/fechado e com/sem aprovação (`/api/auth/signup`), plano padrão, dias de teste (trigger), consulta DataJud ligada/desligada (`/api/processes/*`), limite de usuários do plano nos convites (opcional, em Configurações), retenção da auditoria.

**Cobrança** — sem gateway, receita é estimada pelo preço dos planos × assinaturas ativas (marcado como "estimado"). Para integrar: guardar `gateway_*_id` nos planos/assinaturas, criar a rota de webhook que grava em `payments` e atualiza `subscriptions.status` (`past_due`, `canceled`…) — o Financeiro já lê daí.

## 8. O que ainda é simulado

Envio de e-mail (links saem no terminal), integrações (WhatsApp, IA, agenda, assinatura digital, boletos) e cobrança automática (a estrutura está pronta — seção 7). Autenticação, banco, isolamento, arquivos de documentos, a consulta ao DataJud, o salvamento dos processos e todo o painel Admin são reais.

## 9. Como rodar

Primeira vez: rode `supabase/migrations/0001_lexa_auth.sql` e depois `0003_lexa_admin.sql` (as migrações 0002 de outras frentes, como WhatsApp, são independentes) no SQL Editor do Supabase e preencha o `.env.local` a partir do `.env.example` (URL, anon key, service role, e-mail e senha do Super Admin).

```bash
npm run dev      # http://localhost:3000 (requer Python 3 com `requests` para consultar processos)
npm test         # CNJ, mapper, interpretador, timeline, deduplicação, sincronização, permissões, financeiro
npm run lint
npx tsc --noEmit
```
