# Mesa

**Centro de comando pessoal** — tarefas, caixa de entrada, planejamento, diário, páginas, projetos, áreas da vida e quadros visuais, num só lugar e ligados entre si.

A Mesa é usada por uma pessoa. Cada coisa existe uma única vez: a mesma tarefa aparece no dashboard, no projeto, numa página (citada com `@`) e num quadro visual, sempre como referência ao mesmo registro. Mudou o título ou o status em um lugar, muda em todos.

> Este é um projeto independente dentro do repositório (pasta `desk/`), com dependências, banco e configuração próprios. O app da raiz (Íntegra) não é afetado.

## Rodar localmente

```bash
cd desk
npm install
cp .env.example .env.local       # preencha DESK_SESSION_SECRET e DESK_PASSWORD
npm run dev                      # http://localhost:3200
```

Sem `DATABASE_URL`, os dados ficam num PostgreSQL embutido (PGlite) em `desk/.data/pglite` — em disco, não no navegador. Para usar um PostgreSQL de verdade, defina `DATABASE_URL` (veja abaixo).

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (porta 3200) |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` | ESLint (regras do Next e do React Compiler) |
| `npm run typecheck` | Tipos das rotas (`next typegen`) + `tsc --noEmit` em modo estrito |
| `npm test` | Testes de regras de negócio e serviços (Vitest + PostgreSQL em memória) |
| `npm run test:e2e` | Critérios de aceitação num navegador real (veja “Testes”) |
| `npm run db:migrate` | Aplica as migrações de `drizzle/` |
| `npm run db:generate` | Gera uma nova migração a partir de `lib/db/schema.ts` |
| `npm run auth:hash -- "senha"` | Gera o valor de `DESK_PASSWORD_HASH` |

## Variáveis de ambiente

Todas ficam só no servidor (nenhuma usa `NEXT_PUBLIC_`). Modelo completo em [`.env.example`](./.env.example).

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DESK_SESSION_SECRET` | sim | Assina o cookie de sessão (≥ 32 caracteres) |
| `DESK_PASSWORD` ou `DESK_PASSWORD_HASH` | sim | Senha de acesso (o hash PBKDF2 é preferível) |
| `DATABASE_URL` | em produção | PostgreSQL. Sem ela, banco embutido em `DESK_DATA_DIR` |
| `DATABASE_POOL_MAX` | não | Tamanho do pool (padrão 5) |
| `DESK_DATA_DIR` | não | Pasta do banco embutido (padrão `.data/pglite`) |
| `DESK_ALLOW_EMBEDDED_DB` | não | `true` permite o banco embutido em produção |
| `DESK_AUTO_MIGRATE` | não | `false` desliga a migração automática na primeira conexão |
| `DESK_DEFAULT_TIMEZONE` | não | Fuso até o navegador informar o dele |

Sem `DESK_SESSION_SECRET` e senha, a Mesa **não abre** (a tela de entrada explica o que falta). Não existe modo “sem senha”.

## Banco de dados e migrações

- **PostgreSQL** é o banco: [`lib/db/schema.ts`](./lib/db/schema.ts) (Drizzle ORM) é a definição; [`drizzle/`](./drizzle) guarda as migrações SQL.
- Na primeira conexão o servidor aplica as migrações pendentes. Para controlar isso (ex.: em produção), use `DESK_AUTO_MIGRATE=false` e rode `npm run db:migrate` com a `DATABASE_URL` do ambiente.
- Alterou o esquema? `npm run db:generate` cria a migração; revise o SQL e faça commit.
- **Supabase:** crie o projeto, copie a connection string do Postgres (*Project Settings › Database*, de preferência o *Session pooler*) para `DATABASE_URL`. A Mesa conecta direto ao Postgres pelo servidor; a chave `anon` e a API REST do Supabase não são usadas, e nenhuma credencial vai ao navegador. Se quiser bloquear a API REST para essas tabelas, ative a RLS nelas sem criar políticas — o acesso da Mesa (como dono do banco) continua funcionando.
- Restrições do banco garantem as regras principais: título não vazio, início ≤ prazo, tarefa concluída sempre com data de conclusão (e aberta sem), estimativa positiva, tag única sem diferenciar maiúsculas, uma entrada de diário por dia, e excluir projeto/área **nunca** apaga tarefas (`on delete set null`).

## Como a Mesa funciona

### Fonte única de verdade e referências

| Tabela | Conteúdo |
|---|---|
| `tasks`, `subtasks`, `tags`, `task_tags` | Tarefas (status, prioridade, datas, recorrência, estimativa) |
| `projects`, `areas` | Projetos (com datas e status) e áreas da vida |
| `pages`, `journal_entries` | Documentos em blocos (JSON do editor) e diário, uma entrada por data |
| `content_links` | Referências encontradas nos documentos (derivada a cada salvamento) |
| `boards`, `board_elements`, `board_connections` | Quadros: câmera, elementos (geometria + aparência) e conexões desenhadas |
| `inbox_items` | Capturas; ao converter, guardam o tipo e o id do registro criado |
| `settings` | Nome, fuso e início da semana |

Referências entre módulos são sempre **tipo + id** (uuid), nunca título. O título exibido é lido do registro na hora ([`lib/services/refs.ts`](./lib/services/refs.ts)). Se o registro foi excluído, quem o cita mostra “referência indisponível” e oferece corrigir ou remover — nada some em silêncio.

### Canvas: visual não é automação

Um elemento do quadro guarda **só** aparência, geometria e, quando vinculado, `ref_type` + `ref_id`. Conexões são linhas desenhadas: não criam dependência entre tarefas. Mover, redimensionar ou conectar elementos **nunca** altera tarefas, páginas ou projetos — o salvamento do quadro só escreve nas tabelas `board_*` (há teste para isso). A única ação de dados no canvas é explícita: o botão “Concluir tarefa” no painel de propriedades de um elemento vinculado.

### Datas e fuso

Prazo, início e dia do diário são datas de calendário (`date`), tratadas como texto `AAAA-MM-DD` — nunca mudam de dia por causa de fuso. “Hoje” e “atrasada” usam o fuso da pessoa: o fixado em Configurações ou, sem ele, o informado pelo navegador. Datas de auditoria (`criada`, `atualizada`, `concluída`) são `timestamptz`.

Atrasada = aberta (a fazer ou em andamento) com prazo antes de hoje. Sem prazo nunca é atrasada.

### Salvamento automático

Editor e canvas salvam sozinhos ([`lib/client/autosave.ts`](./lib/client/autosave.ts)):

- um envio por vez, cada um com a versão em que se baseia; o servidor recusa versão antiga (conflito), então uma resposta atrasada nunca sobrescreve uma alteração mais nova;
- indicador **Salvando… / Salvo / Erro ao salvar / Sem conexão**, com “tentar de novo”;
- toda alteração ainda não confirmada fica guardada no aparelho; se a rede cair ou a aba fechar, aparece “Recuperar” ao reabrir;
- conflito com outra aba: a pessoa escolhe manter a própria versão ou a salva.

### Autenticação

Uma senha, verificada no servidor; o cookie de sessão é `httpOnly`, assinado com HMAC-SHA-256 e expira em 30 dias. O `proxy.ts` barra quem não tem sessão, e **cada** página, Server Action e rota de API confere a sessão de novo ([`lib/auth/server.ts`](./lib/auth/server.ts)). Há limite de tentativas de senha por endereço.

## Estrutura

```
desk/
├── app/
│   ├── (desk)/            telas: início, inbox, tasks, planning, journal, pages, projects, areas, canvas, settings
│   ├── actions/           Server Actions (validam a sessão e chamam os serviços)
│   ├── api/               autosave (páginas, diário, quadros), busca, referências, exportação
│   └── login/
├── components/
│   ├── shell/             barra lateral, navegação móvel, paleta de busca (⌘K), criação rápida
│   ├── editor/            editor em blocos (Tiptap): menu "/", referências "@", alça de blocos
│   ├── canvas/            quadro visual (React Flow): elementos, conexões, ferramentas, propriedades
│   ├── tasks/ …           componentes de cada módulo
│   └── ui/                botões, diálogos, menus, estados vazios, indicador de salvamento
├── lib/
│   ├── db/                esquema (Drizzle) e conexão (PostgreSQL ou PGlite)
│   ├── domain/            regras puras: datas locais, tarefas, recorrência, progresso, documentos, busca
│   ├── services/          regras de negócio e acesso ao banco (único lugar que consulta o banco)
│   ├── validation/        esquemas zod de tudo que chega do navegador
│   ├── auth/              sessão e senha
│   └── client/            salvamento automático
├── drizzle/               migrações SQL
├── scripts/               migrate, hash de senha, e2e
└── tests/                 Vitest (domínio e serviços sobre PostgreSQL em memória)
```

## Atalhos

| Onde | Atalho | Ação |
|---|---|---|
| Qualquer tela | `Ctrl/⌘ K` | Busca global e comandos |
| Qualquer tela | `N` / `C` | Nova tarefa / captura rápida |
| Editor | `/` · `@` | Menu de blocos · citar tarefa, página, projeto, diário ou quadro |
| Editor | `Alt Shift ↑/↓` | Mover o bloco |
| Canvas | `V H C R T S F P L` | Selecionar, mover, cartão, forma, texto, nota, frame, caneta, registro |
| Canvas | `Ctrl Z` · `Ctrl Shift Z` · `Ctrl D` · `Delete` · `Shift 1` | Desfazer, refazer, duplicar, remover, ver tudo |

## Exportação

Em **Configurações › Exportar dados**: JSON com todas as tabelas (`/api/export/json`) e um `.zip` com páginas, diário e tarefas em Markdown (`/api/export/markdown`). Ambos exigem sessão.

## Testes

- `npm test` — 44 testes: datas locais e fuso, atraso, conclusão/reabertura, recorrência, progresso, documento em blocos (validação, texto, referências, Markdown), sessão e senha, e serviços sobre um PostgreSQL real em memória (PGlite com as mesmas migrações): filtros, kanban, exclusão de projeto sem apagar tarefas, salvamento com versão, diário por data, caixa de entrada, canvas (salvar/reabrir, mover sem alterar a tarefa, referência excluída), busca e exportação. Com `TEST_DATABASE_URL`, os mesmos testes rodam num PostgreSQL de verdade (**o banco é esvaziado**).
- `npm run test:e2e` — 17 cenários no navegador (os 14 critérios de aceitação e mais: referência indisponível, caixa de entrada, exportação, kanban por arrasto, falha de rede). Com a Mesa rodando sobre um banco vazio: `E2E_BASE=http://localhost:3200 E2E_PASSWORD=sua-senha npm run test:e2e`. Precisa do Playwright com Chromium (`npm i -D playwright && npx playwright install chromium`, ou `PLAYWRIGHT_MODULE` apontando para uma instalação existente).

## Limitações conhecidas

- Uma pessoa só: não há contas, compartilhamento nem colaboração em tempo real. Duas abas editando o mesmo documento geram aviso de conflito (sem mesclagem automática).
- Recorrência simples (diária, semanal, mensal, anual com intervalo); a próxima ocorrência nasce ao concluir.
- Canvas: sem copiar/colar entre quadros, sem imagens/arquivos, sem alinhamento automático; frames não se aninham.
- Busca por texto com `LIKE` sobre texto normalizado (sem acentos). Atende bem uso pessoal; para volumes grandes, trocar por busca textual do PostgreSQL.
- Exportação sem importação correspondente.
- O limite de tentativas de senha fica na memória do processo (reinicia junto com o servidor).
