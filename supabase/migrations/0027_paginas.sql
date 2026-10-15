-- Íntegra — Páginas (anotações, reuniões, planejamentos) dentro de Tarefas.
--
-- Rode no SQL Editor do Supabase depois da 0026. Pode rodar de novo sem erro.
-- ADITIVA: cria só `pages` e `page_favorites`. Nenhuma tabela, dado ou política existente
-- muda. As tarefas continuam em `tasks`: a página guarda só a REFERÊNCIA (id) das tarefas
-- que mostra; a tarefa criada a partir de uma página guarda `data.pageId` (jsonb, sem
-- migração).
--
-- Acesso (sempre no banco, pela RLS — trocar o id na URL não abre página alheia):
--   * Pessoal (`private`): só quem criou lê, edita e exclui. Basta `tasks.view`.
--   * Do escritório (`office`): todos com `tasks.view` leem; editar e excluir pedem
--     `tasks.edit` (a mesma regra das tarefas).
--   * Vinculada a cliente/processo: só aparece para quem também vê aquele cliente/processo
--     (a consulta ao cliente/processo dentro da política passa pela RLS deles).
--   * Subpáginas herdam a visibilidade da página de cima (nada fica "meio pessoal").
--   * Outro escritório nunca lê nem grava (`current_org_id()`).
--
-- O servidor (gatilho) define autor, quem alterou por último, versão, texto de busca e a
-- lista de tarefas referenciadas — o navegador não consegue falsificar esses campos.
-- `version` sobe a cada gravação do título/conteúdo: o editor grava "se a versão ainda for N" e, se outra
-- pessoa gravou antes, avisa do conflito em vez de sobrescrever.

begin;

create table if not exists public.pages (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (id ~ '^pg_[0-9a-f-]{36}$'),
  parent_id text,
  title text not null default '' check (char_length(title) <= 300),
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb
    check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 2000000),
  visibility text not null default 'private' check (visibility in ('private', 'office')),
  client_id text,
  process_id text,
  -- Modelo de origem (só registro de procedência; a página é independente do modelo).
  template text check (template is null or char_length(template) <= 40),
  created_by uuid not null references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1,
  task_ids text[] not null default '{}',
  search text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, parent_id) references public.pages (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, process_id) references public.processes (organization_id, id) on delete set null (process_id)
);

create index if not exists pages_parent_idx on public.pages (organization_id, parent_id);
create index if not exists pages_updated_idx on public.pages (organization_id, updated_at desc);
create index if not exists pages_task_ids_idx on public.pages using gin (task_ids);
create index if not exists pages_client_idx on public.pages (organization_id, client_id) where client_id is not null;
create index if not exists pages_process_idx on public.pages (organization_id, process_id) where process_id is not null;

-- ------------------------------------------------------------ gatilho de gravação
create or replace function public.pages_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent record;
  body text;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.version := 1;
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.organization_id := old.organization_id;
    new.created_at := old.created_at;
    -- A versão marca o TEXTO (título e conteúdo): é ela que detecta duas pessoas
    -- escrevendo na mesma página. Mudar acesso, local ou vínculo não gera conflito.
    if new.title is distinct from old.title or new.content is distinct from old.content then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
    -- Só quem criou muda quem vê a página.
    if new.visibility is distinct from old.visibility and new.parent_id is null and old.created_by is distinct from auth.uid() then
      raise exception 'Só quem criou a página pode mudar quem tem acesso a ela.' using errcode = '42501';
    end if;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Uma página não pode ficar dentro dela mesma.' using errcode = '23514';
    end if;
    -- A página de cima precisa ser visível para quem grava (consulta sujeita à RLS).
    select p.visibility, p.created_by into parent
    from pages p where p.organization_id = new.organization_id and p.id = new.parent_id;
    if not found then
      raise exception 'Página de cima não encontrada.' using errcode = '23503';
    end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      if exists (
        with recursive up as (
          select p.id, p.parent_id from pages p where p.organization_id = new.organization_id and p.id = new.parent_id
          union all
          select p.id, p.parent_id from pages p join up on p.organization_id = new.organization_id and p.id = up.parent_id
        )
        select 1 from up where up.id = new.id
      ) then
        raise exception 'Uma página não pode ficar dentro de uma subpágina dela.' using errcode = '23514';
      end if;
    end if;
    -- Dentro de página pessoal, só páginas da mesma pessoa.
    if parent.visibility = 'private' and parent.created_by is distinct from new.created_by then
      raise exception 'Uma página de outra pessoa não pode ficar dentro de uma página pessoal.' using errcode = '42501';
    end if;
    new.visibility := parent.visibility;
  end if;

  -- Ficar pessoal só se toda a árvore abaixo for de quem criou a página.
  if tg_op = 'UPDATE' and new.visibility = 'private' and old.visibility = 'office' then
    if exists (
      with recursive down as (
        select p.id, p.created_by from pages p where p.organization_id = new.organization_id and p.parent_id = new.id
        union all
        select p.id, p.created_by from pages p join down on p.organization_id = new.organization_id and p.parent_id = down.id
      )
      select 1 from down where down.created_by is distinct from new.created_by
    ) then
      raise exception 'Há subpáginas de outras pessoas: a página não pode ficar pessoal.' using errcode = '42501';
    end if;
  end if;

  -- Tarefas referenciadas e texto de busca vêm do conteúdo (blocos do editor).
  new.task_ids := coalesce(
    (select array_agg(distinct v #>> '{}') from jsonb_path_query(new.content, 'strict $.**.taskId') as v
     where jsonb_typeof(v) = 'string'),
    '{}');
  select string_agg(v #>> '{}', ' ') into body
  from jsonb_path_query(new.content, 'strict $.**.text') as v
  where jsonb_typeof(v) = 'string';
  new.search := public.search_fold(left(coalesce(new.title, '') || ' ' || coalesce(body, ''), 20000));
  return new;
end
$$;

drop trigger if exists pages_before_write on public.pages;
create trigger pages_before_write before insert or update on public.pages
  for each row execute function public.pages_before_write();

-- A visibilidade nova desce para as subpáginas (cada uma herda da de cima).
create or replace function public.pages_after_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update pages set visibility = new.visibility
  where organization_id = new.organization_id and parent_id = new.id and visibility is distinct from new.visibility;
  return null;
end
$$;

drop trigger if exists pages_after_visibility on public.pages;
create trigger pages_after_visibility after update of visibility, parent_id on public.pages
  for each row when (old.visibility is distinct from new.visibility)
  execute function public.pages_after_visibility();

-- ------------------------------------------------------------------ acesso
alter table public.pages enable row level security;
revoke all on public.pages from anon, authenticated;
grant select, delete on public.pages to authenticated;
grant insert (organization_id, id, parent_id, title, content, visibility, client_id, process_id, template)
  on public.pages to authenticated;
grant update (parent_id, title, content, visibility, client_id, process_id) on public.pages to authenticated;

-- Quem vê: do escritório, com `tasks.view`, pessoal só para o autor, e só se a pessoa
-- também vê o cliente/processo vinculado.
create or replace function public.page_visible(p_org uuid, p_visibility text, p_created_by uuid, p_client text, p_process text)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_org = public.current_org_id()
    and public.has_perm('tasks.view')
    and (p_visibility = 'office' or p_created_by = auth.uid())
    and (p_client is null or exists (select 1 from clients c where c.organization_id = p_org and c.id = p_client))
    and (p_process is null or exists (select 1 from processes pr where pr.organization_id = p_org and pr.id = p_process))
$$;

-- Quem altera: pessoal só o autor; do escritório, quem tem `tasks.edit`.
create or replace function public.page_writable(p_visibility text, p_created_by uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select (p_visibility = 'private' and p_created_by = auth.uid())
      or (p_visibility = 'office' and public.has_perm('tasks.edit'))
$$;

revoke execute on function public.page_visible(uuid, text, uuid, text, text) from anon;
revoke execute on function public.page_writable(text, uuid) from anon;

drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages
  for select to authenticated
  using (public.page_visible(organization_id, visibility, created_by, client_id, process_id));

drop policy if exists pages_insert on public.pages;
create policy pages_insert on public.pages
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.page_visible(organization_id, visibility, created_by, client_id, process_id)
    and public.page_writable(visibility, created_by)
  );

drop policy if exists pages_update on public.pages;
create policy pages_update on public.pages
  for update to authenticated
  using (
    public.page_visible(organization_id, visibility, created_by, client_id, process_id)
    and public.page_writable(visibility, created_by)
  )
  with check (
    public.page_visible(organization_id, visibility, created_by, client_id, process_id)
    and public.page_writable(visibility, created_by)
  );

drop policy if exists pages_delete on public.pages;
create policy pages_delete on public.pages
  for delete to authenticated
  using (
    public.page_visible(organization_id, visibility, created_by, client_id, process_id)
    and public.page_writable(visibility, created_by)
  );

-- ---------------------------------------------------------------- favoritos
create table if not exists public.page_favorites (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, page_id),
  foreign key (organization_id, page_id) references public.pages (organization_id, id) on delete cascade
);

alter table public.page_favorites enable row level security;
revoke all on public.page_favorites from anon, authenticated;
grant select, insert, delete on public.page_favorites to authenticated;

drop policy if exists page_favorites_select on public.page_favorites;
create policy page_favorites_select on public.page_favorites
  for select to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid());

-- Só favorita página que a pessoa vê (a consulta passa pela RLS de `pages`).
drop policy if exists page_favorites_insert on public.page_favorites;
create policy page_favorites_insert on public.page_favorites
  for insert to authenticated
  with check (
    organization_id = public.current_org_id() and user_id = auth.uid()
    and exists (select 1 from public.pages p where p.organization_id = page_favorites.organization_id and p.id = page_favorites.page_id)
  );

drop policy if exists page_favorites_delete on public.page_favorites;
create policy page_favorites_delete on public.page_favorites
  for delete to authenticated
  using (organization_id = public.current_org_id() and user_id = auth.uid());

commit;
