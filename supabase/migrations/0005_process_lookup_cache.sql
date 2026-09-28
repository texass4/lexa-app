-- LEXA — cache da consulta de processos e índices de leitura.
--
-- Rode no SQL Editor do Supabase depois da 0001 (independe das outras). Pode rodar de novo sem erro.
--
-- Sem esta migração o LEXA continua funcionando: a consulta usa só o cache em
-- memória do servidor (e avisa no log).

-- ---------------------------------------------------------------------------
-- Cache da consulta processual, por escritório
-- ---------------------------------------------------------------------------
--
-- Guarda a ficha já normalizada (modelo interno do LEXA) do último resultado
-- encontrado na fonte externa. Serve para:
--   * responder na hora quando a consulta é recente (6 h);
--   * entregar o dado conhecido enquanto a atualização roda em segundo plano;
--   * compartilhar a consulta entre as pessoas do mesmo escritório e entre
--     instâncias do servidor.
--
-- Isolado por escritório mesmo sendo dado público: um cache global permitiria
-- a um escritório perceber quais processos outro acompanha.

create table if not exists public.process_lookup_cache (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  cnj text not null check (cnj ~ '^[0-9]{20}$'),
  found boolean not null,
  sheet jsonb,
  fetched_at timestamptz not null default now(),
  primary key (organization_id, cnj)
);

alter table public.process_lookup_cache enable row level security;
revoke all on public.process_lookup_cache from anon;

drop policy if exists process_lookup_cache_select on public.process_lookup_cache;
create policy process_lookup_cache_select on public.process_lookup_cache
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

drop policy if exists process_lookup_cache_insert on public.process_lookup_cache;
create policy process_lookup_cache_insert on public.process_lookup_cache
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_perm('processes.edit'));

drop policy if exists process_lookup_cache_update on public.process_lookup_cache;
create policy process_lookup_cache_update on public.process_lookup_cache
  for update to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.edit'))
  with check (organization_id = public.current_org_id() and public.has_perm('processes.edit'));

-- ---------------------------------------------------------------------------
-- Índices de leitura das coleções
-- ---------------------------------------------------------------------------
--
-- Toda abertura do app lê cada coleção do escritório ordenada por
-- (created_at, id), em páginas (`lib/store/storage.ts`). A chave primária é
-- (organization_id, id) e não serve para essa ordem: sem índice, o banco ordena
-- todas as linhas do escritório a cada página.

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'processes', 'tasks', 'task_columns', 'appointments',
    'appointment_categories', 'documents', 'invoices', 'activities', 'notifications'
  ]
  loop
    execute format('create index if not exists %I on public.%I (organization_id, created_at, id)', t || '_org_created_idx', t);
  end loop;
end
$$;
