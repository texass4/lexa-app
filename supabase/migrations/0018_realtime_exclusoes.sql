-- Íntegra — Exclusões no tempo real sem vazar entre escritórios.
--
-- Rode no SQL Editor do Supabase depois da 0017. Pode rodar de novo sem erro.
--
-- O Realtime do Supabase não aplica RLS a eventos DELETE (o banco não tem como
-- conferir o acesso a uma linha que já não existe) e eles também não respeitam
-- filtros de coluna fora da chave. Resultado: quem montasse uma assinatura própria
-- (sem o filtro do app) recebia o `id` — e, nas tabelas com chave composta, o
-- `organization_id` — de tudo o que fosse excluído em QUALQUER escritório. Sem
-- conteúdo, mas um evento de outro escritório.
--
-- Correção, mantendo o tempo real que o app já usa (postgres_changes):
-- 1. A publicação `supabase_realtime` deixa de enviar DELETE (e TRUNCATE).
-- 2. Cada exclusão grava um "aviso de exclusão" em `realtime_deletions`
--    (coleção + id), por gatilho no banco — vale para o app, o servidor e o SQL.
-- 3. O aviso chega como INSERT, e INSERT passa pela RLS: só recebe quem é do mesmo
--    escritório e pode ver aquela coleção (lançamentos: `finance.view`; atividades
--    financeiras também). O app tira o registro da tela ao receber o aviso.
-- Avisos com mais de 2 dias são apagados (quem estava desconectado se acerta pela
-- revalidação, que confere as versões no banco).

begin;

-- ---------------------------------------------------------------- 1. avisos
create table if not exists public.realtime_deletions (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  collection text not null,
  record_id text not null,
  -- Permissão para ver a coleção (`has_perm`); nula = todo o escritório.
  permission text,
  deleted_at timestamptz not null default now()
);

create index if not exists realtime_deletions_deleted_at_idx on public.realtime_deletions (deleted_at);

alter table public.realtime_deletions enable row level security;
revoke all on public.realtime_deletions from public, anon, authenticated;
grant select on public.realtime_deletions to authenticated;
grant all on public.realtime_deletions to service_role;

drop policy if exists realtime_deletions_select on public.realtime_deletions;
create policy realtime_deletions_select on public.realtime_deletions
  for select to authenticated
  using (organization_id = public.current_org_id() and (permission is null or public.has_perm(permission)));

-- ------------------------------------------------------------- 2. gatilho
-- Argumento: a permissão de leitura da tabela (a mesma da política de SELECT dela).
create or replace function public.record_realtime_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permission text := nullif(tg_argv[0], '');
begin
  if tg_table_name = 'activities' then
    if public.is_financial_activity(old.data) then
      v_permission := 'finance.view';
    end if;
  end if;
  insert into public.realtime_deletions (organization_id, collection, record_id, permission)
  values (old.organization_id, tg_table_name, old.id::text, v_permission);
  delete from public.realtime_deletions where deleted_at < now() - interval '2 days';
  return old;
end
$$;

revoke all on function public.record_realtime_deletion() from public, anon, authenticated;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('activities', ''),
      ('appointment_categories', 'agenda.view'),
      ('appointments', 'agenda.view'),
      ('clients', 'clients.view'),
      ('deadlines', 'processes.view'),
      ('documents', 'documents.view'),
      ('invoices', 'finance.view'),
      ('notifications', ''),
      ('processes', 'processes.view'),
      ('task_columns', 'tasks.view'),
      ('tasks', 'tasks.view'),
      ('triage_items', 'processes.view'),
      ('whatsapp_contacts', 'whatsapp.view'),
      ('whatsapp_conversations', 'whatsapp.view'),
      ('whatsapp_instances', 'whatsapp.view'),
      ('whatsapp_message_attachments', 'whatsapp.view'),
      ('whatsapp_messages', 'whatsapp.view'),
      ('whatsapp_tags', 'whatsapp.view')
    ) as v(tbl, perm)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop trigger if exists realtime_deletion on public.%I', t.tbl);
      execute format(
        'create trigger realtime_deletion after delete on public.%I for each row execute function public.record_realtime_deletion(%L)',
        t.tbl, t.perm
      );
    end if;
  end loop;
end
$$;

-- --------------------------------------------------------- 3. publicação
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Só INSERT e UPDATE (que passam pela RLS); exclusões chegam pelos avisos.
    alter publication supabase_realtime set (publish = 'insert, update');
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'realtime_deletions'
    ) then
      alter publication supabase_realtime add table public.realtime_deletions;
    end if;
  end if;
end
$$;

commit;
