# Teste multiusuário e tempo real (dois navegadores)

Validação de duas pessoas trabalhando ao mesmo tempo no mesmo escritório. **Nada simulado:**
Supabase real (Auth, PostgREST, Realtime, Storage e Postgres com RLS), dois usuários
autenticados em navegadores independentes e um terceiro usuário de **outro escritório**,
logado o tempo todo, para provar o isolamento.

## Ambiente

|                 |                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase        | stack oficial (`supabase start`, CLI 2.119): Postgres 17, GoTrue, PostgREST, **Realtime**, Storage, Kong — as mesmas imagens do Supabase em nuvem |
| Banco           | as 18 migrações de `supabase/migrations`, aplicadas pela CLI (todas passaram sem erro)                                                            |
| App             | `next build` + `next start` (produção), apontando para esse Supabase                                                                              |
| Navegadores     | Chromium em três contextos independentes (sessões, cookies e conexões Realtime separados)                                                         |
| Escritório Alfa | **A** (Ana, sócia) e **B** (Bruno, sócio) — `a@alfa.test`, `b@alfa.test`                                                                          |
| Escritório Beta | **C** (Carla, sócia) — `c@beta.test`                                                                                                              |

Como cada navegador sabe o que recebeu: os roteiros leem os quadros do WebSocket do
Realtime (só eventos de dados, com o escritório de cada um), os avisos que aparecem na
tela e o banco (com a chave de serviço) para conferir o estado final. Uma marca na página
de cada navegador prova que **nenhuma tela foi recarregada** durante o teste.

## Como repetir

```bash
# 1. Supabase de testes (NUNCA o de produção) com as migrações
supabase init && cp -r <repo>/supabase/migrations supabase/ && supabase start
# 2. Variáveis (as chaves que o `supabase start` mostrou)
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=…
# 3. Escritórios e usuários; app em produção
node tests/multiusuario/preparar.mjs
npm run build && npx next start -p 3100
# 4. Roteiros (precisam do playwright-core: `npm i --no-save playwright-core`)
node tests/multiusuario/t-clientes.mjs      # cliente + isolamento nos dois sentidos
node tests/multiusuario/t-entidades.mjs     # processo, tarefa, compromisso, documento, lançamento, prazo, atividade
node tests/multiusuario/t-exclusoes.mjs     # exclusão durante edição, exclusão dupla
node tests/multiusuario/t-rls-realtime.mjs  # assinaturas maliciosas (outro escritório, sem filtro, anônimo)
node tests/multiusuario/t-rls-permissao.mjs # aviso de exclusão respeita a permissão da coleção
# 5. Também
SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run test:integration
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:rls
```

Cada roteiro imprime `OK`/`FALHOU` por verificação e grava fotos e um relatório JSON em
`RT_OUT` (ou numa pasta temporária).

## Resultado (5 de outubro de 2026)

### Criar / editar / excluir — ação em A, B olhando a lista (sem recarregar)

| Entidade              | Criar                            | Editar                           | Excluir          | Observações                                                    |
| --------------------- | -------------------------------- | -------------------------------- | ---------------- | -------------------------------------------------------------- |
| Cliente               | ✅ uma vez                       | ✅ nome novo, antigo some        | ✅ some (≈0,6 s) | clique duplo em "Cadastrar" grava **um** registro              |
| Processo              | ✅ uma vez, código do banco      | ✅                               | ✅ (≈0,5 s)      | edição pelo caminho do app (processo acompanhado, "Preencher") |
| Tarefa                | ✅ na lista de B (atribuída a B) | ✅                               | ✅               | 5 conclusões/reaberturas seguidas: banco e B terminam iguais   |
| Compromisso           | ✅ na agenda de B                | ✅                               | ✅ (≈0,6 s)      |                                                                |
| Documento             | ✅ envio real ao Storage         | ✅ renomear                      | ✅ (≈0,8 s)      |                                                                |
| Lançamento            | ✅                               | ✅                               | ✅ (≈0,6 s)      |                                                                |
| Prazo                 | ✅ (e a tarefa vinculada)        | ✅ cumprir → B vê em "Cumpridos" | —                |                                                                |
| Atividades            | ✅ a atividade de A chega a B    |                                  |                  |                                                                |
| Realtime (integração) | 0,2–0,4 s                        | 0,5 s                            | 0,5 s            | `npm run test:integration`: 9/9                                |

Em todas: nenhuma duplicação na tela, no banco ou no mesmo canal do Realtime; nenhum
erro não tratado; nenhuma página recarregada.

### Conflito — A e B abrem o mesmo registro; A salva; B salva a versão antiga

| Entidade    | B é avisado                                       | Banco mantém a versão de A |
| ----------- | ------------------------------------------------- | -------------------------- |
| Cliente     | ✅ "Este registro foi alterado por outra pessoa." | ✅                         |
| Processo    | ✅                                                | ✅                         |
| Tarefa      | ✅                                                | ✅                         |
| Compromisso | ✅                                                | ✅                         |
| Documento   | ✅                                                | ✅                         |
| Lançamento  | ✅ (valor de A preservado)                        | ✅                         |

O aviso completo: _"Este registro foi alterado por outra pessoa. Sua alteração não foi
gravada. Os dados atuais foram carregados novamente."_ — o formulário recomeça com os dados
atuais. A conferência é feita no banco (`update … where updated_at = <versão>`), então vale
mesmo se o Realtime estiver atrasado.

### Exclusões e concorrência

| Situação                                               | Resultado                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| A exclui o **cliente** que B está editando             | ✅ B é avisado na hora; nada volta a existir _(corrigido — ver abaixo)_ |
| A exclui o **documento** que B está renomeando         | ✅ idem _(corrigido)_                                                   |
| B exclui a **tarefa** que A está editando; A salva     | ✅ A é avisado; a tarefa não volta                                      |
| B exclui o **lançamento** que A está editando; A salva | ✅ A é avisado; não volta                                               |
| A e B excluem a mesma tarefa ao mesmo tempo            | ✅ some dos dois, nenhum erro na tela                                   |
| A e B cadastram clientes ao mesmo tempo                | ✅ cada um aparece uma vez nos dois                                     |
| A e B cadastram processos ao mesmo tempo               | ✅ um registro cada, códigos diferentes                                 |
| Alterações rápidas seguidas (5×)                       | ✅ estado final igual no banco e em B                                   |
| Clique duplo em salvar                                 | ✅ um registro só                                                       |

### Segurança — RLS e isolamento entre escritórios

| Verificação                                                                                            | Resultado                                                                     |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| C (Beta) logado durante todo o teste do Alfa                                                           | ✅ 0 eventos de dados do Alfa                                                 |
| C cria e edita no Beta                                                                                 | ✅ A e B não recebem nada                                                     |
| A e B                                                                                                  | ✅ todos os eventos recebidos são do Alfa                                     |
| C monta assinatura própria: clientes com o filtro do Alfa, sem filtro, lançamentos, avisos de exclusão | ✅ nada _(depois da correção)_                                                |
| Assinatura anônima                                                                                     | ✅ só um aviso vazio `401 Unauthorized`, sem dado (comportamento do Supabase) |
| Estagiário (sem `finance.view`)                                                                        | ✅ recebe o aviso do cliente excluído, não o do lançamento                    |
| `npm run test:rls`                                                                                     | ✅ 3/3 (financeiro, cadastro, avisos de exclusão)                             |

## Problemas encontrados e corrigidos

1. **Exclusões vazavam entre escritórios no Realtime (segurança).** O Realtime do Supabase
   não aplica RLS a eventos `DELETE` (o banco não consegue conferir acesso a uma linha que
   já não existe) e esses eventos não respeitam filtros fora da chave. O app sempre filtra
   pelo escritório, mas **qualquer usuário logado que montasse a própria assinatura** (sem
   filtro) recebia o `id` e o `organization_id` de tudo o que fosse excluído em qualquer
   escritório. Sem conteúdo, mas eram eventos de outro escritório.
   **Correção (migração 0018):** a publicação `supabase_realtime` deixou de enviar DELETE;
   cada exclusão grava, por gatilho, um aviso em `realtime_deletions` (coleção + id). O
   aviso chega como INSERT, que passa pela RLS: só recebe quem é do mesmo escritório **e**
   pode ver a coleção (lançamentos e atividades financeiras exigem `finance.view`). O app
   (`office-sync`, Atendimento) tira o registro ao receber o aviso; quem estava
   desconectado se acerta pela revalidação. Avisos com mais de 2 dias são apagados.
2. **Edição perdida em silêncio quando outra pessoa excluía o registro.** No cliente e no
   documento, o formulário de edição fechava sozinho (a tela do registro virava "não
   encontrado") sem dizer nada — quem editava perdia o que digitou sem saber por quê.
   **Correção:** `useRemovedWhileEditing` (em `lib/store/on-demand.ts`), usado nos seis
   formulários de edição: assim que o registro aberto some, aparece _"Este registro foi
   excluído por outra pessoa. O que você estava editando não foi gravado."_

Observação do roteiro (não é defeito do app): um processo inserido à mão no banco sem
`distributedAt` (campo obrigatório, sempre preenchido pelo app) quebrava o resumo da consulta.
O teste passou a gravar o campo.
