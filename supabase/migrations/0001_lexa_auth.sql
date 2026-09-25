-- LEXA — contas, escritórios e isolamento por escritório (multi-tenant).
--
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez, projeto vazio).
--
-- Regras de segurança:
--   * Todo dado jurídico tem `organization_id`; a RLS só mostra e só aceita linhas do
--     escritório de quem está logado, e só se o perfil e o escritório estiverem ativos.
--   * Cada módulo exige a permissão correspondente (`clients.view`, `clients.edit`…).
--   * Papel, permissões, status e e-mail nunca são graváveis pelo navegador: só as rotas
--     do servidor (service role) alteram essas colunas.
--   * O Super Admin não tem escritório e, portanto, não lê dados jurídicos de ninguém.
--
-- As listas de permissões por papel em `role_defaults` precisam bater com
-- `lib/auth/permissions.ts` (há um teste que confere).

-- ---------------------------------------------------------------------------
-- Escritórios e perfis
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  cnpj text,
  city text,
  address text,
  phone text,
  email text,
  plan text not null default 'Essencial' check (plan in ('Essencial', 'Profissional', 'Escritório')),
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  role text not null check (role in ('super_admin', 'owner', 'lawyer', 'staff')),
  -- null = permissões padrão do papel
  permissions text[],
  name text not null,
  email text not null,
  phone text,
  job_title text,
  oab text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_org_matches_role check ((role = 'super_admin') = (organization_id is null))
);

create index profiles_organization_id_idx on public.profiles (organization_id);

-- ---------------------------------------------------------------------------
-- Funções de autorização (security definer: leem profiles sem recursão de RLS)
-- ---------------------------------------------------------------------------

create or replace function public.role_defaults(p_role text)
returns text[]
language sql
immutable
as $$
  select case p_role
    when 'owner' then array[
      'clients.view', 'clients.edit', 'processes.view', 'processes.edit',
      'tasks.view', 'tasks.edit', 'agenda.view', 'agenda.edit',
      'documents.view', 'documents.edit', 'finance.view', 'finance.edit',
      'office.manage', 'users.manage'
    ]
    when 'lawyer' then array[
      'clients.view', 'clients.edit', 'processes.view', 'processes.edit',
      'tasks.view', 'tasks.edit', 'agenda.view', 'agenda.edit',
      'documents.view', 'documents.edit', 'finance.view'
    ]
    when 'staff' then array[
      'clients.view', 'clients.edit', 'processes.view', 'processes.edit',
      'tasks.view', 'tasks.edit', 'agenda.view', 'agenda.edit',
      'documents.view', 'documents.edit'
    ]
    else array[]::text[]
  end
$$;

-- Escritório de quem está logado, só se o perfil e o escritório estão ativos.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from profiles p
  join organizations o on o.id = p.organization_id
  where p.id = auth.uid() and p.active and o.status = 'active'
$$;

create or replace function public.has_perm(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.role = 'owner' or p_perm = any (coalesce(p.permissions, role_defaults(p.role)))
    from profiles p
    join organizations o on o.id = p.organization_id
    where p.id = auth.uid() and p.active and o.status = 'active'
  ), false)
$$;

-- Escritório do próprio perfil, qualquer que seja o status (para mostrar
-- "aguardando aprovação" / "acesso desativado").
create or replace function public.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from profiles where id = auth.uid()
$$;

revoke execute on function public.current_org_id() from anon;
revoke execute on function public.has_perm(text) from anon;
revoke execute on function public.my_org_id() from anon;

-- ---------------------------------------------------------------------------
-- RLS de escritórios e perfis
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (id = public.my_org_id());

create policy organizations_update on public.organizations
  for update to authenticated
  using (id = public.current_org_id() and public.has_perm('office.manage'))
  with check (id = public.current_org_id() and public.has_perm('office.manage'));

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or organization_id = public.current_org_id());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() and active)
  with check (id = auth.uid() and active);

-- Colunas editáveis pelo navegador. Status, plano, papel, permissões, e-mail e
-- `active` ficam só com o servidor.
revoke insert, update, delete on public.organizations from anon, authenticated;
grant update (name, legal_name, cnpj, city, address, phone, email) on public.organizations to authenticated;

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, phone, job_title, oab, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Dados jurídicos: uma tabela por coleção, entidade inteira em `data` (jsonb)
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

do $$
declare
  t record;
begin
  for t in
    select *
    from (values
      ('clients', 'clients'),
      ('processes', 'processes'),
      ('tasks', 'tasks'),
      ('task_columns', 'tasks'),
      ('appointments', 'agenda'),
      ('appointment_categories', 'agenda'),
      ('documents', 'documents'),
      ('invoices', 'finance')
    ) as v (tbl, module)
  loop
    execute format(
      'create table public.%I (
         organization_id uuid not null references public.organizations (id) on delete cascade,
         id text not null,
         data jsonb not null,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now(),
         primary key (organization_id, id)
       )', t.tbl);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t.tbl || '_touch', t.tbl);
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('revoke all on public.%I from anon', t.tbl);

    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = public.current_org_id() and public.has_perm(%L))',
      t.tbl || '_select', t.tbl, t.module || '.view');
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_perm(%L))',
      t.tbl || '_insert', t.tbl, t.module || '.edit');
    execute format(
      'create policy %I on public.%I for update to authenticated using (organization_id = public.current_org_id() and public.has_perm(%L)) with check (organization_id = public.current_org_id() and public.has_perm(%L))',
      t.tbl || '_update', t.tbl, t.module || '.edit', t.module || '.edit');
    execute format(
      'create policy %I on public.%I for delete to authenticated using (organization_id = public.current_org_id() and public.has_perm(%L))',
      t.tbl || '_delete', t.tbl, t.module || '.edit');
  end loop;

  -- Atividades e notificações: qualquer membro ativo do escritório lê e registra.
  for t in select * from (values ('activities'), ('notifications')) as v (tbl)
  loop
    execute format(
      'create table public.%I (
         organization_id uuid not null references public.organizations (id) on delete cascade,
         id text not null,
         data jsonb not null,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now(),
         primary key (organization_id, id)
       )', t.tbl);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t.tbl || '_touch', t.tbl);
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('revoke all on public.%I from anon', t.tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = public.current_org_id())',
      t.tbl || '_select', t.tbl);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (organization_id = public.current_org_id())',
      t.tbl || '_insert', t.tbl);
  end loop;
end
$$;

-- Marcar notificação como lida.
create policy notifications_update on public.notifications
  for update to authenticated
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- Storage: fotos de perfil (públicas) e arquivos dos documentos (privados)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do nothing;

-- Foto: cada pessoa escreve só na própria pasta `<uid>/…`.
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Leitura pela API (necessária para remover a foto antiga); a exibição usa a URL pública.
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Documentos: pasta `<organization_id>/…`, com as permissões do módulo.
create policy documents_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_perm('documents.view')
  );

create policy documents_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_perm('documents.edit')
  );

create policy documents_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.has_perm('documents.edit')
  );
