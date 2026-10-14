-- Íntegra — Listagens com milhares de registros: histórico em páginas, busca e
-- contagens no banco.
--
-- Rode no SQL Editor do Supabase depois da 0016. Pode rodar de novo sem erro.
--
-- As telas (Tarefas, Prazos, Documentos, Financeiro) mostram na hora o que a
-- abertura já trouxe (os recentes e os em aberto) e leem o histórico do banco aos
-- poucos, 50 por vez. Para isso:
--
-- 1. Coluna `search` (texto sem acento, em minúsculas) nas coleções com histórico:
--    a busca da tela também procura no que ainda não foi carregado. Gerada pelo
--    banco a partir de `data` — o app não grava nela.
-- 2. Contagens do histórico (o que está fora da janela da abertura), numa consulta
--    por tela: os números das abas e dos totais continuam corretos sem baixar os
--    registros. As funções rodam com as permissões de quem chama (RLS): cada pessoa
--    só conta o que pode ver, do próprio escritório.
-- 3. Índices para ler o histórico na ordem da tela (mais recentes primeiro).

begin;

-- --------------------------------------------------------------- 1. busca
-- Mesmo resultado de `normalize` em lib/core/format.ts (sem acento, minúsculas).
create or replace function public.search_fold(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(translate(coalesce(p_text, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'))
$$;

alter table public.tasks
  add column if not exists search text
  generated always as (public.search_fold(coalesce(data ->> 'title', '') || ' ' || coalesce(data ->> 'description', ''))) stored;
alter table public.deadlines
  add column if not exists search text
  generated always as (public.search_fold(data ->> 'description')) stored;
alter table public.documents
  add column if not exists search text
  generated always as (public.search_fold(coalesce(data ->> 'name', '') || ' ' || coalesce(data ->> 'kind', ''))) stored;
alter table public.invoices
  add column if not exists search text
  generated always as (public.search_fold(
    coalesce(data ->> 'description', '') || ' ' || coalesce(data ->> 'category', '') || ' ' ||
    coalesce(data ->> 'notes', '') || ' ' || coalesce(data ->> 'method', ''))) stored;

-- ------------------------------------------------------ 2. contagens
-- `p_before`/`p_from`: o início da janela da abertura (`initialScopes`). Cada
-- função conta exatamente o complemento dessa janela.

-- Tarefas concluídas antes da janela, por responsável e coluna do quadro.
create or replace function public.task_history_counts(p_before text)
returns table (assignee_id text, column_id text, total bigint)
language sql
stable
set search_path = public
as $$
  select t.data ->> 'assigneeId', t.data ->> 'columnId', count(*)
    from public.tasks t
   where coalesce(t.data ->> 'status', '') <> 'pendente'
     and coalesce(t.data ->> 'completedAt', '') < p_before
   group by 1, 2
$$;

-- Prazos encerrados antes da janela, por situação e responsável.
create or replace function public.deadline_history_counts(p_before text)
returns table (status text, responsible_id text, total bigint)
language sql
stable
set search_path = public
as $$
  select d.data ->> 'status', d.data ->> 'responsibleId', count(*)
    from public.deadlines d
   where coalesce(d.data ->> 'status', '') <> 'aberto'
     and coalesce(d.data ->> 'closedAt', '') < p_before
   group by 1, 2
$$;

-- Documentos anteriores à janela: total, tamanho, por tipo e os clientes com documento.
create or replace function public.document_history_stats(p_before text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with h as (
    select coalesce(d.data ->> 'kind', '') as kind,
           d.data ->> 'clientId' as client_id,
           case when d.data ->> 'sizeBytes' ~ '^[0-9]+(\.[0-9]+)?$' then (d.data ->> 'sizeBytes')::numeric else 0 end as size
      from public.documents d
     where coalesce(d.data ->> 'uploadedAt', '') < p_before
  )
  select jsonb_build_object(
    'total', (select count(*) from h),
    'bytes', (select coalesce(sum(size), 0) from h),
    'kinds', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) as n from h group by kind) k),
    'clients', (select coalesce(jsonb_agg(client_id), '[]'::jsonb) from (select distinct client_id from h where client_id is not null) c)
  )
$$;

-- Lançamentos anteriores à janela (pagos e cancelados): quantos por situação e o
-- valor faturado (não cancelado) — base da inadimplência.
create or replace function public.invoice_history_stats(p_from text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with h as (
    select coalesce(i.data ->> 'status', '') as status,
           case when i.data ->> 'amount' ~ '^-?[0-9]+(\.[0-9]+)?$' then (i.data ->> 'amount')::numeric else 0 end as amount
      from public.invoices i
     where coalesce(i.data ->> 'status', '') not in ('pendente', 'atrasado')
       and coalesce(i.data ->> 'dueDate', '') < p_from
       and coalesce(i.data ->> 'paidAt', '') < p_from
  )
  select jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) as n from h group by status) s),
    'billed', (select coalesce(sum(amount), 0) from h where status <> 'cancelado')
  )
$$;

revoke all on function public.task_history_counts(text) from public, anon;
revoke all on function public.deadline_history_counts(text) from public, anon;
revoke all on function public.document_history_stats(text) from public, anon;
revoke all on function public.invoice_history_stats(text) from public, anon;
grant execute on function public.task_history_counts(text) to authenticated, service_role;
grant execute on function public.deadline_history_counts(text) to authenticated, service_role;
grant execute on function public.document_history_stats(text) to authenticated, service_role;
grant execute on function public.invoice_history_stats(text) to authenticated, service_role;

-- ------------------------------------------------------------- 3. índices
create index if not exists tasks_org_completed_idx on public.tasks (organization_id, (data ->> 'completedAt'));
create index if not exists deadlines_org_closed_idx on public.deadlines (organization_id, (data ->> 'closedAt'));
create index if not exists invoices_org_due_idx on public.invoices (organization_id, (data ->> 'dueDate'));
create index if not exists invoices_org_paid_idx on public.invoices (organization_id, (data ->> 'paidAt'));
create index if not exists activities_org_at_idx on public.activities (organization_id, (data ->> 'at'));

commit;
