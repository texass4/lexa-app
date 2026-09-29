-- Íntegra — prazos (tabela `deadlines`).
--
-- Rode no SQL Editor do Supabase depois da 0006 (versão de registro e tempo real).
-- Pode rodar de novo sem erro.
--
-- Mesmo formato das outras coleções do escritório (`organization_id`, `id`,
-- `data jsonb`, `created_at`, `updated_at`) — o app lê e grava pelo mesmo caminho,
-- com a mesma conferência de versão e o mesmo Realtime. Além disso, os vínculos
-- são colunas de verdade, derivadas de `data` pelo banco, com chave estrangeira
-- composta `(organization_id, …)` — nada aponta para outro escritório:
--   * processo (obrigatório): excluir o processo exclui os prazos dele;
--   * cliente: sempre o cliente do processo (o banco preenche e acompanha a troca);
--   * responsável e quem criou: membros do escritório;
--   * tarefa vinculada: excluir a tarefa deixa o prazo "sem tarefa".
-- Quando o banco limpa um vínculo (exclusão do cliente, da tarefa ou do membro), o
-- campo correspondente sai também de `data`, e a mudança chega às telas pelo Realtime.
--
-- Regras (as mesmas do formulário, `lib/prazos.ts`): descrição, data fatal, data
-- interna, responsável e processo obrigatórios; origem `manual` ou `intimacao`;
-- estado `aberto`, `cumprido` ou `perdido` (todo prazo nasce `aberto`); data interna
-- depois da fatal só com justificativa. Quem criou é sempre a pessoa logada.
--
-- RLS: módulo de processos (`processes.view` para ler, `processes.edit` para gravar).

begin;

-- Chave composta "membro deste escritório" (também criada pela 0002).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_org_id_key') then
    alter table public.profiles add constraint profiles_org_id_key unique (organization_id, id);
  end if;
end
$$;

create table if not exists public.deadlines (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null,
  data jsonb not null,
  -- Derivadas de `data` pelo gatilho abaixo; o navegador não grava nelas.
  process_id text not null,
  client_id text,
  responsible_id uuid,
  task_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, process_id) references public.processes (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, responsible_id) references public.profiles (organization_id, id) on delete set null (responsible_id),
  foreign key (organization_id, created_by) references public.profiles (organization_id, id) on delete set null (created_by),
  foreign key (organization_id, task_id) references public.tasks (organization_id, id) on delete set null (task_id),
  constraint deadlines_description check (char_length(btrim(coalesce(data ->> 'description', ''))) between 1 and 500),
  constraint deadlines_dates check (
    coalesce(data ->> 'fatalDate', '') ~ '^\d{4}-\d{2}-\d{2}$' and coalesce(data ->> 'internalDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  constraint deadlines_internal_date check (
    data ->> 'internalDate' <= data ->> 'fatalDate' or char_length(btrim(coalesce(data ->> 'internalDateReason', ''))) > 0
  ),
  constraint deadlines_origin check (data ->> 'origin' in ('manual', 'intimacao')),
  constraint deadlines_status check (data ->> 'status' in ('aberto', 'cumprido', 'perdido'))
);

create index if not exists deadlines_org_created_idx on public.deadlines (organization_id, created_at, id);
create index if not exists deadlines_process_idx on public.deadlines (organization_id, process_id);
create index if not exists deadlines_task_idx on public.deadlines (organization_id, task_id) where task_id is not null;

-- ---------------------------------------------------------------------------
-- Vínculos: `data` → colunas (e o caminho de volta quando o banco limpa um vínculo)
-- ---------------------------------------------------------------------------

create or replace function public.deadlines_sync_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  process_client text;
begin
  if tg_op = 'UPDATE' then
    -- Vínculo limpo pelo banco (ON DELETE SET NULL): a coluna mudou e `data` ainda
    -- aponta para o registro que saiu. O app nunca grava nestas colunas.
    if new.client_id is null and old.client_id is not null and new.data ->> 'clientId' = old.client_id then
      new.data := new.data - 'clientId';
    end if;
    if new.responsible_id is null and old.responsible_id is not null and new.data ->> 'responsibleId' = old.responsible_id::text then
      new.data := new.data - 'responsibleId';
    end if;
    if new.task_id is null and old.task_id is not null and new.data ->> 'taskId' = old.task_id then
      new.data := new.data - 'taskId';
    end if;
    if new.created_by is null and old.created_by is not null then
      -- Membro que criou foi removido do escritório.
      new.data := new.data - 'createdById';
    elsif old.created_by is not null then
      -- Quem criou não muda.
      new.created_by := old.created_by;
      new.data := jsonb_set(new.data, '{createdById}', to_jsonb(old.created_by::text));
    else
      new.created_by := null;
      new.data := new.data - 'createdById';
    end if;
  else
    if new.data ->> 'status' is distinct from 'aberto' then
      raise exception 'Todo prazo nasce aberto.' using errcode = 'check_violation';
    end if;
    if nullif(new.data ->> 'responsibleId', '') is null then
      raise exception 'Prazo sem responsável.' using errcode = 'check_violation';
    end if;
    -- Quem criou é a pessoa logada (no SQL Editor, o que vier em `data`).
    new.created_by := coalesce(auth.uid(), nullif(new.data ->> 'createdById', '')::uuid);
    if new.created_by is not null then
      new.data := jsonb_set(new.data, '{createdById}', to_jsonb(new.created_by::text));
    end if;
  end if;

  -- Data fatal e data interna: obrigatórias e dias que existem (31/02 não).
  if coalesce(new.data ->> 'fatalDate', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(new.data ->> 'internalDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Data fatal e data interna são obrigatórias.' using errcode = 'check_violation';
  end if;
  begin
    perform (new.data ->> 'fatalDate')::date, (new.data ->> 'internalDate')::date;
  exception when others then
    raise exception 'Data de prazo inválida.' using errcode = 'check_violation';
  end;

  new.process_id := nullif(new.data ->> 'processId', '');
  new.responsible_id := nullif(new.data ->> 'responsibleId', '')::uuid;
  new.task_id := nullif(new.data ->> 'taskId', '');

  -- Cliente = o do processo, se ele ainda existir (um processo pode ter ficado sem cliente).
  select c.id into process_client
    from processes p
    join clients c on c.organization_id = p.organization_id and c.id = p.data ->> 'clientId'
   where p.organization_id = new.organization_id and p.id = new.process_id;
  new.client_id := process_client;
  new.data := case when process_client is null then new.data - 'clientId' else jsonb_set(new.data, '{clientId}', to_jsonb(process_client)) end;

  return new;
end
$$;

revoke execute on function public.deadlines_sync_links() from public, anon, authenticated;

drop trigger if exists deadlines_sync_links on public.deadlines;
create trigger deadlines_sync_links
  before insert or update on public.deadlines
  for each row execute function public.deadlines_sync_links();

-- Versão do registro (controle de concorrência, `0006_team_sync.sql`).
drop trigger if exists deadlines_touch on public.deadlines;
create trigger deadlines_touch
  before insert or update on public.deadlines
  for each row execute function public.bump_row_version();

-- Trocou o cliente do processo: os prazos acompanham.
create or replace function public.processes_sync_deadline_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update deadlines d
     set data = d.data
   where d.organization_id = new.organization_id
     and d.process_id = new.id
     and d.client_id is distinct from (
       select c.id from clients c where c.organization_id = new.organization_id and c.id = new.data ->> 'clientId'
     );
  return null;
end
$$;

revoke execute on function public.processes_sync_deadline_client() from public, anon, authenticated;

drop trigger if exists processes_sync_deadline_client on public.processes;
create trigger processes_sync_deadline_client
  after update on public.processes
  for each row
  when (old.data ->> 'clientId' is distinct from new.data ->> 'clientId')
  execute function public.processes_sync_deadline_client();

-- ---------------------------------------------------------------------------
-- RLS: mesmo padrão das outras coleções, no módulo de processos
-- ---------------------------------------------------------------------------

alter table public.deadlines enable row level security;
revoke all on public.deadlines from anon;
revoke insert, update, delete on public.deadlines from authenticated;
grant select, delete on public.deadlines to authenticated;
-- O navegador grava só a entidade (`data`); vínculos e versão são do banco.
grant insert (organization_id, id, data) on public.deadlines to authenticated;
grant update (data) on public.deadlines to authenticated;

drop policy if exists deadlines_select on public.deadlines;
create policy deadlines_select on public.deadlines for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

drop policy if exists deadlines_insert on public.deadlines;
create policy deadlines_insert on public.deadlines for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_perm('processes.edit'));

drop policy if exists deadlines_update on public.deadlines;
create policy deadlines_update on public.deadlines for update to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.edit'))
  with check (organization_id = public.current_org_id() and public.has_perm('processes.edit'));

drop policy if exists deadlines_delete on public.deadlines;
create policy deadlines_delete on public.deadlines for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.edit'));

-- ---------------------------------------------------------------------------
-- Tempo real (mesma publicação das outras coleções)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
     and not exists (
       select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deadlines'
     ) then
    alter publication supabase_realtime add table public.deadlines;
  end if;
end
$$;

commit;

-- Conferência: a tabela está no tempo real?
select tablename as "tabela no tempo real"
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deadlines';
