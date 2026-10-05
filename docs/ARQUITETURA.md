# Íntegra — manual de arquitetura

Este manual explica como o projeto está organizado, que padrões o código segue e como alterar o sistema sem quebrar nada. Para os detalhes de cada módulo (regras de negócio, fluxos, banco e integrações), veja [MODULOS.md](./MODULOS.md). A auditoria do MVP está em [AUDITORIA_MVP.md](./AUDITORIA_MVP.md).

---

## 1. Visão geral

A Íntegra é um app **Next.js 16 (App Router) + React 19** com **Supabase** (Auth, Postgres com RLS, Realtime e Storage). A interface é a do redesign: barra lateral marinho com o fundo de colunas, conteúdo claro em cartões e tokens de design em `app/globals.css`.

```
Navegador
  app/(app)/<página>/page.tsx          página fina: só renderiza a view do módulo
      ↓
  components/<módulo>/<x>-view.tsx     tela do módulo (componentes "use client")
      ↓ lê / age                        ↓ permissões
  useOfficeData() · useOfficeActions()  useSession().can() · <Can>
      ↓
  lib/store/office-store.tsx           cópia local dos dados do escritório
      ↓ grava diff / recebe Realtime
  lib/store/storage.ts + office-sync.ts
      ↓
Supabase (RLS isola por escritório e por permissão)

Servidor (Route Handlers em app/api/*)
  auth/guard (requireMember · requireActor · requireAdmin · aiRoute · segredo)
      ↓
  lib/services/<domínio>/*             regras de servidor (consulta de processos, e-mail, WhatsApp, triagem…)
      ↓
  lib/integrations/*                   clientes HTTP de terceiros (DataJud, DJEN, Z-API)
```

**Princípios**

1. **Página não tem lógica.** Cada `page.tsx` só define metadata e renderiza a view do módulo.
2. **Organização por módulo.** Cada página do menu tem a sua pasta em `components/` e, quando tem regras próprias, em `lib/`, com o **mesmo nome da rota**.
3. **Regra de negócio fora da tela.** Cálculos, validações e textos derivados ficam em funções puras em `lib/<módulo>/`, que são testadas. A view só monta a interface.
4. **O banco decide quem vê o quê.** A interface esconde ações com `can()`, mas o isolamento real é a RLS do Supabase.
5. **Nada é fingido.** O que não existe não aparece, ou aparece como "Em breve". Não há dados de demonstração.

---

## 2. Mapa: página → código

| Página (rota) | Tela (`components/`) | Regras (`lib/`) | Servidor / API |
|---|---|---|---|
| Início `/dashboard` | `dashboard/` | `dashboard/dashboard.ts`, `dashboard/attention.ts`, `dashboard/visits.ts` | `api/ai/office/*` (panorama) |
| Triagem `/triagem` | `triagem/` | `triagem/`, `intimacoes/` | `services/triagem/`, `services/intimacoes/`, `api/cron/process-sync` |
| Clientes `/clientes`, `/clientes/[id]` | `clientes/`, `clientes/profile/` | `clientes/clients.ts`, `clientes/client-import.ts` | `api/ai/client/summary` |
| Atendimento `/atendimento` | `atendimento/` | `whatsapp/` | `services/whatsapp/`, `integrations/whatsapp/`, `api/whatsapp/*` |
| Processos `/processos`, `/processos/[id]` | `processos/` | `processos/cnj.ts` | `services/processos/`, `integrations/legal/`, `api/processes/*`, `api/ai/process/*` |
| Tarefas `/tarefas` | `tarefas/` | `store/selectors.ts` (`taskBucket`) | — |
| Prazos `/tarefas/prazos` | `prazos/` | `prazos/prazos.ts` | — |
| Agenda `/agenda` | `agenda/` | `agenda/agenda.ts` | — |
| Documentos `/documentos` | `documentos/` | `documentos/documents.ts` | Storage (`documents`) |
| Financeiro `/financeiro` | `financeiro/` | `financeiro/invoices.ts`, `store/selectors.ts` (`financeSummary`) | — |
| Configurações `/configuracoes` | `configuracoes/` | `auth/` (perfil, permissões, membros) | `api/team/*`, `api/me/*` |
| Login, cadastro, senha `(auth)/*` | `auth/` | `auth/validation.ts`, `auth/mailer.ts` | `api/auth/*`, `app/auth/confirm` |
| Íntegra Admin `/admin/*` | `admin/<seção>/` | `admin/` | `api/admin/*` |

Peças transversais:

| Pasta | O quê |
|---|---|
| `components/layout/` | shell do app: barra lateral (`sidebar.tsx`, `nav-config.ts`), topo, mobile, busca `Ctrl K`, notificações, diálogos globais, intro |
| `components/ai/` | Íntegra IA na interface: provedor do chat, painéis por contexto, blocos de resposta |
| `components/shared/` | peças usadas por mais de um módulo (timeline, lista de documentos, item de processo…) |
| `components/ui/` | design system (botão, painel, modal, tabela, abas, badges, campos…) |
| `components/brand/` | logotipo da Íntegra |
| `lib/core/` | utilitários sem regra de negócio (datas, formatação, máscaras, CSV, tema, marca, rótulos de status) |
| `lib/store/` | store do escritório, store de interface, persistência e seletores |
| `lib/auth/` | sessão, conta logada, permissões, guardas de rota, membros, e-mails de autenticação |
| `lib/ai/` | Íntegra IA no servidor: provedor, contexto, prompts, schemas, medição, limites, cache |
| `lib/supabase/` | clientes Supabase: navegador, servidor (cookie) e admin (service role) |
| `lib/services/` | regras que só rodam no servidor, por domínio |
| `lib/integrations/` | clientes HTTP de terceiros, atrás de contratos neutros |
| `types/` | contratos de todas as entidades (`index.ts`) e do WhatsApp (`whatsapp.ts`) |

---

## 3. Estrutura de pastas

```
lexa-app/
├── app/                         rotas (só páginas finas, layouts e Route Handlers)
│   ├── (app)/                   área logada: dashboard, triagem, clientes, atendimento, processos,
│   │                            tarefas (+ prazos), agenda, documentos, financeiro, configuracoes
│   ├── (auth)/                  login, cadastro, recuperar-senha, redefinir-senha
│   ├── (admin)/admin/           Íntegra Admin (papel conferido no servidor)
│   ├── auth/confirm/            troca o token dos links de e-mail por sessão
│   ├── api/                     Route Handlers (ver seção 5)
│   ├── globals.css              tokens de design (claro/escuro) e utilitários globais
│   ├── layout.tsx               raiz: fontes, tema, Providers
│   └── manifest.ts, icon.svg…   ícones e manifest
├── components/
│   ├── <módulo>/                uma pasta por página: dashboard, triagem, clientes, atendimento,
│   │                            processos, tarefas, prazos, agenda, documentos, financeiro,
│   │                            configuracoes, auth, admin
│   ├── layout/  ai/  shared/  ui/  brand/
│   └── providers.tsx            tema, stores, toasts e animações
├── lib/
│   ├── <módulo>/                regras puras por página: dashboard, clientes, processos, prazos,
│   │                            agenda, documentos, financeiro, triagem, intimacoes, whatsapp
│   ├── core/                    utilitários comuns
│   ├── store/  auth/  ai/  admin/  supabase/
│   ├── services/                servidor: email, intimacoes, processos, triagem, whatsapp
│   └── integrations/            legal/ (DataJud, DJEN) · whatsapp/ (Z-API)
├── types/                       tipos das entidades
├── supabase/
│   ├── migrations/              SQL do banco em ordem (0001 → 0013): tabelas, RLS, funções, Storage
│   └── templates/               e-mails do Supabase Auth (gerados por `npm run email:templates`)
├── public/brand/                ícones do manifest, kit da marca (SVG) e fundo da barra lateral
├── scripts/                     scripts de e-mail (templates do Supabase, teste de SMTP)
├── tests/                       loader do `node --test` e teste de integração com Supabase real
├── docs/                        este manual, referência por módulo e auditoria
├── proxy.ts                     sessão e bloqueio de rotas (o "middleware" do Next 16)
└── instrumentation.ts           cria o Super Admin ao subir o servidor
```

---

## 4. Padrões de código

### Nomes

| O quê | Padrão | Exemplo |
|---|---|---|
| Rotas, pastas de página e de módulo | português, igual à URL | `app/(app)/tarefas`, `components/tarefas`, `lib/prazos` |
| Pastas técnicas | inglês | `core`, `store`, `auth`, `services`, `integrations`, `ui` |
| Arquivos | `kebab-case` | `new-process-dialog.tsx`, `client-import.ts` |
| Tela principal de um módulo | `<nome>-view.tsx`, exportando `<Nome>View` | `processes-view.tsx` → `ProcessesView` |
| Diálogos | `new-<x>-dialog.tsx`, `edit-<x>-dialog.tsx` | `new-invoice-dialog.tsx` |
| Hooks | `use-<x>.ts`, função `useX` | `use-process-refresh.ts` |
| Testes | ao lado do arquivo, `<arquivo>.test.ts` | `lib/prazos/prazos.test.ts` |
| Rotas de API | inglês, recursos REST | `app/api/processes/[id]/sync` |

### Imports

- Sempre pelo alias `@/` (`@/lib/core/dates`, `@/components/ui/button`). Import relativo (`./x`) só entre arquivos da mesma pasta.
- Classes CSS: `import { cn } from "cn"`.
- Um módulo pode usar `lib/core`, `lib/store`, `lib/auth`, `components/ui` e `components/shared`. Um módulo não importa a tela de outro; se duas páginas precisam da mesma peça, ela vai para `components/shared`.

### Componentes

- Telas e componentes interativos são `"use client"`. Páginas (`page.tsx`) e layouts ficam no servidor.
- Dados do escritório só pelo store:
  ```ts
  const { clients, processes, hydrated } = useOfficeData()
  const { addTask, updateClient } = useOfficeActions()
  ```
- Diálogos globais (criar cliente, tarefa, prazo, compromisso, documento, processo, lançamento): `useUI().openDialog("task", { processId })`.
- Permissões na interface: `useSession().can("finance.edit")` ou `<Can permission="finance.edit">`.
- Visual: reutilize `components/ui` (`PageHeader`, `Panel`, `MetricCard`, `Button`, `StatusBadge`, `FilterTabs`, `DataTable`, `EmptyState`, `Skeleton`, `Modal`, `SideSheet`, `Field`). Cores e raios saem dos tokens (`bg-surface`, `text-muted-foreground`, `rounded-card`, `shadow-card`). Não use cores soltas (`#hex`) nos componentes.
- Estados obrigatórios em toda lista: carregando (`Skeleton` até `hydrated`), vazio (`EmptyState` com o próximo passo) e erro.
- Responsividade (testada em 320, 375, 390, 768, 1024, 1280, 1440 e 1920 px):
  - Divisões da página em colunas e troca tabela ↔ cartões usam a largura do conteúdo, não da janela: `<main>` é o container `@container/main` (`components/layout/app-shell.tsx`). Use `@4xl/main:grid-cols-12` (≥ 896 px de conteúdo) em vez de `lg:` — com a barra lateral aberta em 1024 px, as colunas empilham em vez de espremer.
  - Tabela larga (`min-w-[860px]`) só aparece com `@4xl/main:block`; antes disso, a mesma lista em cartões (`@4xl/main:hidden`). Ações de cada linha nunca podem ficar escondidas por rolagem horizontal.
  - Toque: controle menor que 44 px recebe `touch-target` (área de clique ampliada só em telas de toque, sem mudar o visual; o elemento precisa ser `relative`/`absolute`). `Button`, `AnimatedCheckbox`, `ChoiceChips` e gatilhos de `DropdownMenu` já trazem. Quando a área ampliada encostaria em outro link, aumente o controle com `pointer-coarse:` (ex.: `pointer-coarse:h-8`).
  - No celular, prefira reorganizar a cortar: valor e situação abaixo do nome, rótulo abaixo do ícone (`MetricCard` com `@container`), títulos em até duas linhas (`PanelHeader`).

### Regras e dados

- Data e hora: sempre `getNow()` e os formatadores de `lib/core/dates.ts`, nunca `new Date()` solto na tela.
- Moeda, números e busca sem acento: `lib/core/format.ts`.
- Status e rótulos (prioridade, status de cliente, processo, fatura e prazo): `lib/core/config.ts`.
- Fatura atrasada: use `invoiceStatus()`; o `invoice.status` gravado não sabe que o vencimento passou.
- Toda regra que a tela calcula vira função pura em `lib/<módulo>/` com teste.

### Servidor

- Toda Route Handler começa pela guarda certa: `requireMember(permissão)` (escritório), `requireActor` (WhatsApp), `requireAdmin` (Admin), `aiRoute` (IA) ou o segredo da rota (cron e webhook).
- Erros para o navegador: só mensagem clara e orientada à ação, sem variável de ambiente, nome de serviço/provedor, código HTTP, SQL, caminho ou stack. Detalhe técnico vai para o log do servidor (`console.error` com prefixo, ex.: `[whatsapp]`).
  - `lib/core/public-error.ts` (`publicMessage`, `isTechnicalMessage`) é a rede de segurança: `route()` passa toda `HttpError` por ela (mensagem técnica vira a padrão do status e o original vai para o log) e os clientes de API do navegador (`lib/whatsapp/client.ts`, `lib/ai/client.ts`, `lib/admin/client.ts`, formulários de login/cadastro) também. Ainda assim, escreva a mensagem certa na origem.
  - Configuração que falta (chave da IA, credenciais do WhatsApp, migração não aplicada) aparece para o escritório como "Fale com o suporte da Íntegra" ou "Tente novamente em instantes"; o diagnóstico com nomes de variáveis fica no log e no Super Admin (Monitoramento e Configurações), que é a tela de quem opera a plataforma.
  - Exceção consciente: o aviso de privacidade da IA (`components/ai/ai-privacy.tsx`) nomeia os provedores que recebem dados (Google Gemini e Anthropic), por transparência (LGPD).
  - `lib/core/ui-copy.test.ts` varre o texto das telas do escritório e falha se aparecer detalhe técnico.
- `service role` (`lib/supabase/admin.ts`) só no servidor e sempre filtrando por `organization_id`.
- Chaves e segredos só em variáveis de ambiente do servidor (veja `.env.example`).

### Comentários

Em português, explicando **por que** o código é assim (regra jurídica, limite de API, decisão de segurança). Não descreva o óbvio.

---

## 5. Camada de API (`app/api`)

| Grupo | Guarda | Para quê |
|---|---|---|
| `auth/signup`, `auth/recover`, `auth/events` | pública / sessão | cadastro, recuperação de senha, auditoria de login |
| `me/email`, `team/users/*` | `requireMember` | conta da pessoa e equipe do escritório |
| `processes/search`, `processes/[id]/sync`, `processes/monitoring` | `requireMember("processes.*")` | consulta de processo pelo CNJ e monitoramento |
| `ai/*` | `aiRoute` | Íntegra IA (medição, limites e cache no banco) |
| `whatsapp/*` | `requireActor` | Central de Atendimento |
| `whatsapp/webhook` | segredo do webhook | eventos da Z-API |
| `cron/process-sync` | `Bearer CRON_SECRET` | monitoramento, captura do DJEN e interpretação da Triagem |
| `admin/*` | `requireAdmin` | Íntegra Admin |

---

## 6. Dados

- Cada coleção do escritório é uma tabela `(organization_id, id, data jsonb, created_at, updated_at)`. A RLS libera só o escritório da pessoa e só os módulos que ela pode ver.
- O store carrega as coleções ao entrar, grava só o que mudou (agrupado em 300 ms) e recebe as mudanças da equipe pelo Realtime. Edições conferem a versão (`updated_at`): se outra pessoa gravou antes, a gravação é recusada com aviso.
- WhatsApp, Triagem, intimações, monitoramento, consumo de IA e Admin têm tabelas próprias (ver as migrações).
- Arquivos: Storage, em `documents/<organization_id>/…` e `whatsapp/<organization_id>/…`, sempre com URL assinada.

---

## 7. Como alterar

**Nova página**
1. `app/(app)/<rota>/page.tsx` renderizando `<Nome>View`.
2. `components/<rota>/<nome>-view.tsx` com a tela.
3. Regras em `lib/<rota>/<arquivo>.ts` + `<arquivo>.test.ts`.
4. Item no menu e permissão em `components/layout/nav-config.ts`.

**Novo campo num cadastro**: tipo em `types/index.ts` → formulário → ação no `office-store.tsx` → exibição. O `jsonb` não precisa de migração.

**Nova coleção**: tipo → `PersistedState` e `TABLES` em `lib/store/storage.ts` → tabela, índices e políticas numa nova migração em `supabase/migrations/` (próximo número).

**Nova ação de negócio**: método em `OfficeActions` (`lib/store/office-store.tsx`), registrando uma `Activity` quando fizer sentido.

**Nova rota de API**: `app/api/<recurso>/route.ts` com a guarda certa → lógica em `lib/services/<domínio>/` → cliente HTTP de terceiro em `lib/integrations/` (se houver).

**Nova permissão**: `lib/auth/permissions.ts` **e** `role_defaults` numa migração (o teste `permissions.test.ts` falha se divergirem).

---

## 8. Comandos

```bash
npm run dev               # desenvolvimento (http://localhost:3000)
npm run build && npm start
npm run lint
npm run typecheck         # next typegen + tsc --noEmit
npm test                  # testes unitários (lib/**/*.test.ts)
npm run test:integration  # contra um Supabase real (ver tests/integration)
npm run email:templates   # regenera supabase/templates/
npm run email:verify      # testa o SMTP do .env.local
```

Antes de publicar: `lint`, `typecheck`, `test` e `build` precisam passar.

---

## 9. Limpeza e organização (outubro de 2026)

Base: o redesign com o fundo de colunas na barra lateral (`claude/keen-ride-8iewki`). Nenhuma funcionalidade, tela ou regra de banco mudou.

**Removido**
- `ARCHITECTURE_REPORT.md`: relatório histórico de branches antigas (211 KB), já superado.
- `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`: arquivos padrão do `create-next-app`, sem uso.
- `components/admin/admin-view.tsx`: apelido antigo da tela do Admin, ninguém importava.
- Código morto: gráfico de área do Financeiro substituído pelo de barras (`RevenueAreaChart`), constantes nunca lidas (`DEFAULT_GEMINI_MODEL`, `COLLECTION_OF_TABLE`, `INTERPRET_VERSION`) e uma reexportação sem uso (`STALE_DAYS` em `lib/ai/context/office.ts`).
- Tokens CSS sem uso do tema inicial: `chart-1…5`, `sidebar-primary*`, `sidebar-accent-foreground`, `ease-out-soft`, `radius-3xl/4xl`.
- 86 `export` de funções e constantes que só eram usadas dentro do próprio arquivo (a API pública de cada arquivo ficou só com o que é usado de fora).

**Reorganizado**
- Os 24 arquivos soltos na raiz de `lib/` foram para pastas por módulo (`lib/clientes`, `lib/processos`, `lib/prazos`, `lib/agenda`, `lib/documentos`, `lib/financeiro`, `lib/dashboard`) ou para `lib/core`, `lib/auth` e `lib/store`.
- `components/tasks` → `components/tarefas` e `lib/services/processes` → `lib/services/processos`, iguais às rotas.
- `lib/store/demo-store.tsx` → `lib/store/office-store.tsx`, com `useDemoData`/`useDemoActions` → `useOfficeData`/`useOfficeActions` (o nome "demo" era de quando havia dados fictícios e confundia).
- Documentação em `docs/`: este manual, a referência por módulo (`MODULOS.md`, o antigo `ARCHITECTURE.md` com os caminhos atualizados) e a auditoria do MVP.

**Trazido do commit "Trabalho local" (`claude/eager-wright-ie9vfo`)**
- Financeiro: categoria, observação e situação "Cancelado" nos lançamentos; abas A receber / Recebidos / Em atraso / Cancelados, busca, botão "Recebido", exclusão e "Novo lançamento" no topo; CSV com processo, categoria e observação. Cancelado não conta como aberto nem como inadimplência.
- Atraso calculado pelo vencimento (`invoiceStatus`) também na Íntegra IA e nos sinais de atenção.
- Triagem: cada item mostra por que entrou na fila ("Possível prazo em 3 dias", "Pode exigir uma providência") e a contagem da fila.
- Linguagem: "Leitura", "Conversa" e "Perguntar" no lugar de "Íntegra IA" nas telas; frase de abertura do painel com as movimentações recentes.
- Tema escuro mais claro e sombras próprias do escuro (agora aplicadas de verdade, via `--elevation-*`).
- E-mail de cadastro recebido, refeito sobre o serviço SMTP atual (`sendSignupEmail`).
- Não trazido: o envio por Brevo (substituído pelo SMTP genérico), os cartões de indicadores em texto (o painel segue a referência do redesign) e o `CRON_SECRET` preenchido no `.env.example`.

**Mantido de propósito**
- `public/brand/*.svg`: kit da marca para uso fora do app (e-mail, materiais). A interface desenha o logotipo em `components/brand/logo.tsx`.
- `lib/core/utils.ts`: alvo do alias `utils` do shadcn em `components.json`, para o CLI continuar funcionando.
- Componentes do design system com partes ainda não usadas (`DropdownMenuPortal`, `PopoverTitle`…): fazem parte do kit.
- Comentários das migrações já aplicadas citam caminhos antigos; arquivo de migração aplicada não se edita.
- Identificadores com o nome antigo LEXA (`lexa-app`, `LEXA_*`, `lexa:*`, `LexaAIProvider`): trocar quebraria preferências salvas, variáveis de ambiente e webhooks já configurados.
