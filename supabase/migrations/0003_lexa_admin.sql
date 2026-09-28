-- LEXA — Painel Admin: planos, assinaturas, pagamentos, auditoria, uso e configurações.
--
-- Rode depois de `0001_lexa_auth.sql` (não depende das 0002 de WhatsApp ou clientes), no SQL Editor do Supabase (uma vez). É
-- idempotente onde dá para ser: pode rodar de novo sem duplicar dados.
--
-- Regras de segurança (mesmas da 0001):
--   * Nada daqui é gravável pelo navegador. Só as rotas do servidor (service role),
--     depois de `requireAdmin()`, escrevem — e só o Super Admin chega nelas.
--   * Tabelas administrativas (assinaturas, pagamentos, auditoria, uso, configurações)
--     têm RLS ligada e NENHUMA política: `anon` e `authenticated` não leem nem gravam.
--   * As funções de agregação são `security definer`, sem EXECUTE para `anon`/
--     `authenticated`, e ainda conferem `auth.role() = 'service_role'` por dentro.
--   * O Super Admin continua sem ler dados jurídicos: as funções devolvem contagens,
--     tamanhos e datas — nunca o conteúdo de clientes, processos ou documentos.

-- ---------------------------------------------------------------------------
-- Planos
-- ---------------------------------------------------------------------------

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 60),
  description text,
  -- Centavos, para não ter arredondamento de ponto flutuante.
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'BRL',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  -- null = sem limite
  max_users integer check (max_users is null or max_users >= 0),
  max_processes integer check (max_processes is null or max_processes >= 0),
  max_clients integer check (max_clients is null or max_clients >= 0),
  max_storage_mb integer check (max_storage_mb is null or max_storage_mb >= 0),
  max_whatsapp_messages integer check (max_whatsapp_messages is null or max_whatsapp_messages >= 0),
  max_ai_requests integer check (max_ai_requests is null or max_ai_requests >= 0),
  features text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  -- Preparado para o gateway de cobrança (Stripe, Mercado Pago…).
  gateway_product_id text,
  gateway_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

-- Os três planos que já existiam. Preço 0 = ainda não definido (o Admin define em Planos).
insert into public.plans (name, description, sort_order, max_users, max_processes, max_clients, max_storage_mb, max_whatsapp_messages, max_ai_requests, features)
values
  ('Essencial', 'Para escritórios começando a organizar a operação.', 1, 3, 500, 1000, 5120, 1000, 200,
    array['clients', 'processes', 'tasks', 'agenda', 'documents', 'datajud']),
  ('Profissional', 'Para equipes em crescimento, com financeiro e permissões.', 2, 10, 3000, 5000, 25600, 5000, 1000,
    array['clients', 'processes', 'tasks', 'agenda', 'documents', 'finance', 'datajud', 'custom_permissions', 'whatsapp']),
  ('Escritório', 'Para operações maiores, sem limite de equipe.', 3, null, null, null, 102400, 20000, 5000,
    array['clients', 'processes', 'tasks', 'agenda', 'documents', 'finance', 'datajud', 'custom_permissions', 'whatsapp', 'ai', 'priority_support'])
on conflict (name) do nothing;

alter table public.plans enable row level security;
revoke all on public.plans from anon, authenticated;
grant select on public.plans to authenticated;
drop policy if exists plans_select on public.plans;
-- Catálogo de planos não é segredo: o CRM pode mostrar limites do próprio plano.
create policy plans_select on public.plans for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Escritórios: plano vira referência ao catálogo; status ganha "suspenso"
-- ---------------------------------------------------------------------------

alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations drop constraint if exists organizations_plan_fkey;
-- Renomear um plano atualiza os escritórios; excluir um plano em uso é bloqueado.
alter table public.organizations
  add constraint organizations_plan_fkey foreign key (plan) references public.plans (name) on update cascade;

alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check check (status in ('pending', 'active', 'suspended', 'inactive'));

alter table public.organizations add column if not exists status_reason text;
alter table public.organizations add column if not exists admin_notes text;
-- Limites só deste escritório (sobrepõem os do plano): {"users": 15, "storage_mb": null…}
alter table public.organizations add column if not exists custom_limits jsonb;
alter table public.organizations add column if not exists updated_at timestamptz not null default now();

drop trigger if exists organizations_touch on public.organizations;
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();

-- As novas colunas NÃO entram no `grant update (...)` da 0001: continuam só no servidor.

-- ---------------------------------------------------------------------------
-- Configurações da plataforma (uma linha só)
-- ---------------------------------------------------------------------------

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  -- Só o que foi alterado; o código completa com os padrões (`lib/admin/settings.ts`).
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

-- Manutenção ligada? Pública de propósito (a tela de login e o CRM precisam saber),
-- mas devolve só o necessário — nada de outras configurações.
create or replace function public.platform_maintenance()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce((select s.data -> 'maintenance' ->> 'enabled' = 'true' from public.platform_settings s where s.id), false),
    'message', (select s.data -> 'maintenance' ->> 'message' from public.platform_settings s where s.id)
  )
$$;

revoke execute on function public.platform_maintenance() from public;
grant execute on function public.platform_maintenance() to anon, authenticated, service_role;

-- Em manutenção, nenhum escritório lê ou grava dados (a RLS de todas as tabelas
-- depende desta função). O Super Admin não é afetado: ele não tem escritório.
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
    and not coalesce((select s.data -> 'maintenance' ->> 'enabled' = 'true' from platform_settings s where s.id), false)
$$;

revoke execute on function public.current_org_id() from anon;

-- ---------------------------------------------------------------------------
-- Assinaturas (estado de cobrança; o plano em si fica em organizations.plan)
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  gateway text not null default 'manual' check (gateway in ('manual', 'stripe', 'mercadopago', 'other')),
  gateway_customer_id text,
  gateway_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;

-- Escritórios que já existiam.
insert into public.subscriptions (organization_id, status, current_period_start, canceled_at)
select o.id,
  case o.status when 'active' then 'active' when 'pending' then 'trialing' else 'canceled' end,
  case when o.status = 'active' then coalesce(o.approved_at, o.created_at) end,
  case when o.status = 'inactive' then now() end
from public.organizations o
on conflict (organization_id) do nothing;

-- Todo escritório novo (cadastro público ou criado pelo Admin) nasce em teste,
-- com os dias de teste definidos nas configurações (padrão 14).
create or replace function public.organizations_create_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  days integer;
begin
  select coalesce(nullif(s.data -> 'general' ->> 'trialDays', '')::integer, 14)
    into days from public.platform_settings s where s.id;
  insert into public.subscriptions (organization_id, status, trial_ends_at)
  values (new.id, 'trialing', case when coalesce(days, 14) > 0 then now() + make_interval(days => coalesce(days, 14)) end)
  on conflict (organization_id) do nothing;
  return new;
end
$$;

revoke execute on function public.organizations_create_subscription() from public, anon, authenticated;

drop trigger if exists organizations_subscription on public.organizations;
create trigger organizations_subscription after insert on public.organizations
  for each row execute function public.organizations_create_subscription();

-- ---------------------------------------------------------------------------
-- Pagamentos (vazio até existir gateway; o webhook do gateway grava aqui)
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded', 'canceled')),
  description text,
  due_date date,
  paid_at timestamptz,
  gateway text not null default 'manual' check (gateway in ('manual', 'stripe', 'mercadopago', 'other')),
  gateway_payment_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists payments_org_created_idx on public.payments (organization_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, due_date);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- Sem FK de propósito: o registro sobrevive à exclusão de quem agiu ou do escritório.
  actor_id uuid,
  actor_name text,
  actor_email text,
  actor_role text,
  organization_id uuid,
  action text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  target_type text,
  target_id text,
  target_label text,
  summary text,
  metadata jsonb not null default '{}',
  ip text,
  user_agent text
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;

-- Registro de auditoria não se edita (nem pela service role). Excluir fica permitido
-- só para a limpeza por tempo de retenção.
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs é somente inserção';
end
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update before update on public.audit_logs for each row execute function public.audit_logs_immutable();

-- ---------------------------------------------------------------------------
-- Uso de recursos medidos por evento (WhatsApp, IA). As integrações gravam aqui
-- com `recordUsage()` (lib/admin/usage.ts).
-- ---------------------------------------------------------------------------

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('whatsapp_message', 'ai_request')),
  quantity integer not null default 1 check (quantity > 0),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists usage_events_org_kind_created_idx on public.usage_events (organization_id, kind, created_at desc);

alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções de agregação do Admin (só service role)
-- ---------------------------------------------------------------------------

-- Uso por escritório: contagens, armazenamento real (Storage), consumo do mês e
-- datas de último acesso/alteração. Uma consulta só, agrupada — sem N+1.
create or replace function public.admin_org_usage()
returns table (
  organization_id uuid,
  users integer,
  active_users integer,
  clients integer,
  processes integer,
  tasks integer,
  appointments integer,
  documents integer,
  invoices integer,
  storage_bytes bigint,
  whatsapp_month integer,
  ai_month integer,
  last_sign_in_at timestamptz,
  last_data_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with
    people as (
      select p.organization_id as org, count(*) as total, count(*) filter (where p.active) as active, max(u.last_sign_in_at) as last_sign_in
      from public.profiles p
      left join auth.users u on u.id = p.id
      where p.organization_id is not null
      group by p.organization_id
    ),
    data as (
      select organization_id as org, 'clients' as k, count(*) as n, max(updated_at) as last from public.clients group by 1
      union all select organization_id, 'processes', count(*), max(updated_at) from public.processes group by 1
      union all select organization_id, 'tasks', count(*), max(updated_at) from public.tasks group by 1
      union all select organization_id, 'appointments', count(*), max(updated_at) from public.appointments group by 1
      union all select organization_id, 'documents', count(*), max(updated_at) from public.documents group by 1
      union all select organization_id, 'invoices', count(*), max(updated_at) from public.invoices group by 1
      union all select organization_id, 'activities', count(*), max(updated_at) from public.activities group by 1
    ),
    files as (
      select split_part(o.name, '/', 1) as org, sum(coalesce((o.metadata ->> 'size')::bigint, 0)) as bytes
      from storage.objects o
      where o.bucket_id = 'documents'
      group by 1
    ),
    metered as (
      select e.organization_id as org,
        sum(e.quantity) filter (where e.kind = 'whatsapp_message') as whatsapp,
        sum(e.quantity) filter (where e.kind = 'ai_request') as ai
      from public.usage_events e
      where e.created_at >= date_trunc('month', now())
      group by 1
    )
  select
    o.id,
    coalesce(pe.total, 0)::integer,
    coalesce(pe.active, 0)::integer,
    coalesce((select d.n from data d where d.org = o.id and d.k = 'clients'), 0)::integer,
    coalesce((select d.n from data d where d.org = o.id and d.k = 'processes'), 0)::integer,
    coalesce((select d.n from data d where d.org = o.id and d.k = 'tasks'), 0)::integer,
    coalesce((select d.n from data d where d.org = o.id and d.k = 'appointments'), 0)::integer,
    coalesce((select d.n from data d where d.org = o.id and d.k = 'documents'), 0)::integer,
    coalesce((select d.n from data d where d.org = o.id and d.k = 'invoices'), 0)::integer,
    coalesce(f.bytes, 0)::bigint,
    coalesce(m.whatsapp, 0)::integer,
    coalesce(m.ai, 0)::integer,
    pe.last_sign_in,
    (select max(d.last) from data d where d.org = o.id)
  from public.organizations o
  left join people pe on pe.org = o.id
  left join files f on f.org = o.id::text
  left join metered m on m.org = o.id
  where (select auth.role()) = 'service_role'
$$;

-- Registros criados por dia no período (fuso de Brasília), para os gráficos.
-- `p_org` restringe a um escritório.
create or replace function public.admin_activity_series(p_from timestamptz, p_to timestamptz, p_org uuid default null, p_tz text default 'America/Sao_Paulo')
returns table (
  day date,
  organizations integer,
  users integer,
  clients integer,
  processes integer,
  tasks integer,
  documents integer,
  appointments integer,
  logins integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with
    days as (
      select generate_series((p_from at time zone p_tz)::date, (p_to at time zone p_tz)::date, interval '1 day')::date as day
    ),
    ev as (
      select (created_at at time zone p_tz)::date as d, 'organizations' as k from public.organizations
        where created_at >= p_from and created_at < p_to and (p_org is null or id = p_org)
      union all select (created_at at time zone p_tz)::date, 'users' from public.profiles
        where organization_id is not null and created_at >= p_from and created_at < p_to and (p_org is null or organization_id = p_org)
      union all select (created_at at time zone p_tz)::date, 'clients' from public.clients
        where created_at >= p_from and created_at < p_to and (p_org is null or organization_id = p_org)
      union all select (created_at at time zone p_tz)::date, 'processes' from public.processes
        where created_at >= p_from and created_at < p_to and (p_org is null or organization_id = p_org)
      union all select (created_at at time zone p_tz)::date, 'tasks' from public.tasks
        where created_at >= p_from and created_at < p_to and (p_org is null or organization_id = p_org)
      union all select (created_at at time zone p_tz)::date, 'documents' from public.documents
        where created_at >= p_from and created_at < p_to and (p_org is null or organization_id = p_org)
      union all select (created_at at time zone p_tz)::date, 'appointments' from public.appointments
        where created_at >= p_from and created_at < p_to and (p_org is null or organization_id = p_org)
      union all select (created_at at time zone p_tz)::date, 'logins' from public.audit_logs
        where action = 'auth.login' and created_at >= p_from and created_at < p_to and (p_org is null or organization_id = p_org)
    )
  select
    days.day,
    count(ev.k) filter (where ev.k = 'organizations')::integer,
    count(ev.k) filter (where ev.k = 'users')::integer,
    count(ev.k) filter (where ev.k = 'clients')::integer,
    count(ev.k) filter (where ev.k = 'processes')::integer,
    count(ev.k) filter (where ev.k = 'tasks')::integer,
    count(ev.k) filter (where ev.k = 'documents')::integer,
    count(ev.k) filter (where ev.k = 'appointments')::integer,
    count(ev.k) filter (where ev.k = 'logins')::integer
  from days
  left join ev on ev.d = days.day
  where (select auth.role()) = 'service_role'
  group by days.day
  order by days.day
$$;

-- Último acesso de cada usuário (auth.users não é exposto pela API).
create or replace function public.admin_user_access()
returns table (id uuid, last_sign_in_at timestamptz, email_confirmed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.last_sign_in_at, u.email_confirmed_at
  from auth.users u
  where (select auth.role()) = 'service_role'
$$;

revoke execute on function public.admin_org_usage() from public, anon, authenticated;
revoke execute on function public.admin_activity_series(timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_user_access() from public, anon, authenticated;
grant execute on function public.admin_org_usage() to service_role;
grant execute on function public.admin_activity_series(timestamptz, timestamptz, uuid, text) to service_role;
grant execute on function public.admin_user_access() to service_role;
