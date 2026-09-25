# LEXA — mapa do código

Guia para alterar o sistema sem adivinhar onde cada coisa mora. Alias `@/` aponta para a raiz de `lexa-app/`.

```
UI (página/componente)
    ↓  lê / age
useDemoData() · useDemoActions() · useUI()
    ↓
demo-store (+ storage.ts → localStorage, por organização)   ui-store
    ↓  começa vazio — sem dados de demonstração
lib/account.ts   (escritório e pessoa logada, até existir login)
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
│   └── api/processes/        search (consulta) e [id]/sync (atualizar)
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
│   ├── store/                demo-store, ui-store, storage (persistência)
│   ├── account.ts            escritório e usuário atual (até existir login)
│   ├── config.ts             labels, cores de status e paleta das categorias
│   ├── selectors.ts          consultas derivadas (inclui o financeiro, calculado das faturas)
│   ├── dates.ts              `getNow()` + formatadores
│   └── format.ts             moeda, busca, normalização de texto, IDs
├── python/datajud.py         cliente do DataJud (usado pelas rotas; roda sozinho no terminal)
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
const data = useDemoData()          // clients, processes, tasks, appointments, appointmentCategories…, hydrated
const { addTask, importProcess } = useDemoActions()
```

Ações: `addClient`/`updateClient`, `addProcess`/`updateProcess`/`importProcess`/`applyProcessSync`, `addTask`/`updateTask`/`toggleTask`, `addAppointment`, `addAppointmentCategory`/`updateAppointmentCategory`/`deleteAppointmentCategory`, `addDocument`, `markNotificationRead`/`markAllNotificationsRead`.

- **Não há dados de demonstração.** O store começa vazio; tudo o que o escritório cadastra é gravado por `lib/store/storage.ts` no `localStorage`, sob a chave da organização (`lexa:data:v1:<ORG_ID>`). A gravação é agrupada (300 ms) e forçada ao sair da página. Sem espaço, os processos são salvos sem o `raw` das movimentações e um aviso aparece. Trocar por banco = mudar só esse arquivo.
- `hydrated` fica `true` quando os dados salvos terminam de carregar (uma vez por sessão). As telas mostram esqueleto só até lá — navegar entre abas não recarrega nada.
- Horário: sempre `getNow()` (`lib/dates.ts`), nunca `new Date()` espalhado pela UI.
- `lib/account.ts` tem o escritório e a pessoa logada (`CURRENT_USER_ID`) — placeholder até existir login.

Novo campo num cadastro: tipo em `types/index.ts` → seed → formulário → ação no store → exibição.
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

## 6. O que ainda é simulado

Login, banco de dados, upload de arquivos, integrações (WhatsApp, e-mail, agenda, assinatura, boletos) e cobrança. A consulta ao DataJud e o salvamento dos processos são reais.

---

## 7. Como rodar

```bash
npm run dev      # http://localhost:3000 (requer Python 3 com `requests` para consultar processos)
npm test         # CNJ, mapper, interpretador, timeline, deduplicação, armazenamento, financeiro
npm run lint
npx tsc --noEmit
```
