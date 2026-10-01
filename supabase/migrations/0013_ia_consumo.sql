-- Íntegra — IA com custo sob controle: consumo medido, limites no banco, cache comum.
--
-- Rode no SQL Editor do Supabase depois da 0012. Pode rodar de novo sem erro.
--
-- 1. `usage_events` ganha os dados de cada chamada de IA: pessoa, operação, provedor,
--    modelo, tokens, custo estimado (US$), duração, resultado. Nada de prompt nem de
--    resposta. Chamadas da Central de Atendimento (WhatsApp) não passam por aqui.
-- 2. `ai_reserve` / `ai_finish`: a chamada só acontece depois de reservada no banco.
--    A reserva é atômica por escritório (trava transacional), então vale com vários
--    servidores: limite do plano no mês (plano ou limite personalizado do escritório),
--    ritmo por pessoa (por minuto e por hora) e por escritório (por hora).
-- 3. `ai_result_cache`: análises idênticas (mesmo contexto) reaproveitadas por todos os
--    servidores, sem chamar o modelo de novo. Só o servidor lê e grava.
-- 4. `admin_ai_usage`: consumo por escritório, operação e modelo num período (Super Admin).
-- 5. `admin_org_usage` passa a contar no plano só as chamadas que chegaram ao modelo
--    (sem erros e sem respostas do cache).
-- 6. Triagem: evento que esbarra no limite do plano espera, sem gastar tentativa.

begin;

-- ---------------------------------------------------------------------------
-- 1. Consumo por chamada
-- ---------------------------------------------------------------------------

alter table public.usage_events
  add column if not exists user_id uuid,
  add column if not exists operation text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists cached_tokens integer,
  add column if not exists cost_usd numeric(14, 6),
  add column if not exists duration_ms integer,
  add column if not exists error_code text,
  add column if not exists status text not null default 'ok';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usage_events_status_check') then
    alter table public.usage_events add constraint usage_events_status_check check (status in ('pendente', 'ok', 'erro', 'cache'));
  end if;
end
$$;

create index if not exists usage_events_ai_user_idx on public.usage_events (organization_id, user_id, created_at desc) where kind = 'ai_request';
create index if not exists usage_events_ai_period_idx on public.usage_events (created_at) where kind = 'ai_request';

-- ---------------------------------------------------------------------------
-- 2. Limites no banco
-- ---------------------------------------------------------------------------

-- Limite mensal de IA do escritório: o personalizado, senão o do plano. `null` = sem limite.
create or replace function public.ai_monthly_limit(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.custom_limits ? 'ai' then
      case when (o.custom_limits ->> 'ai') ~ '^[0-9]+(\.[0-9]+)?$' then floor((o.custom_limits ->> 'ai')::numeric)::integer end
    else p.max_ai_requests
  end
  from organizations o
  left join plans p on p.name = o.plan
  where o.id = p_org
$$;

-- Chamadas do mês que contam no plano (chegaram ao modelo ou estão em andamento).
create or replace function public.ai_monthly_used(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(e.quantity), 0)::integer
    from usage_events e
   where e.organization_id = p_org and e.kind = 'ai_request' and e.status in ('ok', 'pendente')
     and e.created_at >= date_trunc('month', now())
$$;

revoke execute on function public.ai_monthly_limit(uuid) from public, anon, authenticated;
revoke execute on function public.ai_monthly_used(uuid) from public, anon, authenticated;
grant execute on function public.ai_monthly_limit(uuid) to service_role;
grant execute on function public.ai_monthly_used(uuid) to service_role;

-- Reserva uma chamada: confere os limites e registra a chamada como "pendente", tudo
-- sob a mesma trava do escritório. `p_user` nulo = automática (sem limite por pessoa).
create or replace function public.ai_reserve(
  p_org uuid,
  p_user uuid,
  p_operation text,
  p_provider text,
  p_model text,
  p_user_per_minute integer default 8,
  p_user_per_hour integer default 60,
  p_org_per_hour integer default 200
)
returns table (event_id bigint, allowed boolean, reason text, retry_after integer, used integer, monthly_limit integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  lim integer;
  n integer;
  window_start timestamptz;
  new_id bigint;
begin
  if not exists (select 1 from organizations where id = p_org) then
    return query select null::bigint, false, 'escritorio_inexistente', 0, 0, 0;
    return;
  end if;

  -- Uma reserva por vez em cada escritório, em qualquer servidor.
  perform pg_advisory_xact_lock(hashtextextended('lexa-ai:' || p_org::text, 0));

  lim := ai_monthly_limit(p_org);
  n := ai_monthly_used(p_org);
  if lim is not null and n >= lim then
    return query select null::bigint, false, 'plano',
      greatest(60, extract(epoch from (date_trunc('month', now()) + interval '1 month' - now()))::integer), n, lim;
    return;
  end if;

  if p_user is not null then
    select min(e.created_at) into window_start from (
      select e.created_at from usage_events e
       where e.organization_id = p_org and e.user_id = p_user and e.kind = 'ai_request' and e.status <> 'cache'
         and e.created_at > now() - interval '1 minute'
       order by e.created_at desc limit greatest(p_user_per_minute, 1)
    ) e having count(*) >= p_user_per_minute;
    if window_start is not null then
      return query select null::bigint, false, 'pessoa', greatest(1, ceil(extract(epoch from (window_start + interval '1 minute' - now())))::integer), n, lim;
      return;
    end if;

    select min(e.created_at) into window_start from (
      select e.created_at from usage_events e
       where e.organization_id = p_org and e.user_id = p_user and e.kind = 'ai_request' and e.status <> 'cache'
         and e.created_at > now() - interval '1 hour'
       order by e.created_at desc limit greatest(p_user_per_hour, 1)
    ) e having count(*) >= p_user_per_hour;
    if window_start is not null then
      return query select null::bigint, false, 'pessoa', greatest(1, ceil(extract(epoch from (window_start + interval '1 hour' - now())))::integer), n, lim;
      return;
    end if;
  end if;

  select min(e.created_at) into window_start from (
    select e.created_at from usage_events e
     where e.organization_id = p_org and e.kind = 'ai_request' and e.status <> 'cache'
       and e.created_at > now() - interval '1 hour'
     order by e.created_at desc limit greatest(p_org_per_hour, 1)
  ) e having count(*) >= p_org_per_hour;
  if window_start is not null then
    return query select null::bigint, false, 'escritorio', greatest(1, ceil(extract(epoch from (window_start + interval '1 hour' - now())))::integer), n, lim;
    return;
  end if;

  insert into usage_events (organization_id, kind, quantity, user_id, operation, provider, model, status)
  values (p_org, 'ai_request', 1, p_user, left(p_operation, 80), left(p_provider, 40), left(p_model, 80), 'pendente')
  returning id into new_id;

  return query select new_id, true, null::text, 0, n + 1, lim;
end
$$;

-- Resultado da chamada reservada: tokens, custo, duração e erro (se houve).
create or replace function public.ai_finish(
  p_event bigint,
  p_status text,
  p_model text default null,
  p_input integer default null,
  p_output integer default null,
  p_cached integer default null,
  p_cost numeric default null,
  p_error text default null,
  p_duration integer default null
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update usage_events
     set status = case when p_status in ('ok', 'erro') then p_status else 'erro' end,
         model = coalesce(left(p_model, 80), model),
         input_tokens = p_input,
         output_tokens = p_output,
         cached_tokens = p_cached,
         cost_usd = p_cost,
         error_code = left(p_error, 40),
         duration_ms = p_duration
   where id = p_event and kind = 'ai_request' and status = 'pendente'
$$;

revoke execute on function public.ai_reserve(uuid, uuid, text, text, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.ai_finish(bigint, text, text, integer, integer, integer, numeric, text, integer) from public, anon, authenticated;
grant execute on function public.ai_reserve(uuid, uuid, text, text, text, integer, integer, integer) to service_role;
grant execute on function public.ai_finish(bigint, text, text, integer, integer, integer, numeric, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Cache de análises (comum a todos os servidores)
-- ---------------------------------------------------------------------------

create table if not exists public.ai_result_cache (
  key text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  operation text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists ai_result_cache_expires_idx on public.ai_result_cache (expires_at);
create index if not exists ai_result_cache_org_idx on public.ai_result_cache (organization_id);

alter table public.ai_result_cache enable row level security;
revoke all on public.ai_result_cache from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Consumo de IA para o Super Admin
-- ---------------------------------------------------------------------------

create or replace function public.admin_ai_usage(p_from timestamptz, p_to timestamptz)
returns table (
  organization_id uuid,
  operation text,
  model text,
  calls bigint,
  cached_calls bigint,
  errors bigint,
  input_tokens bigint,
  output_tokens bigint,
  cached_tokens bigint,
  cost_usd numeric,
  unpriced bigint,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.organization_id,
    coalesce(e.operation, '(antes da medição)'),
    coalesce(e.model, '—'),
    count(*) filter (where e.status in ('ok', 'pendente')),
    count(*) filter (where e.status = 'cache'),
    count(*) filter (where e.status = 'erro'),
    coalesce(sum(e.input_tokens), 0)::bigint,
    coalesce(sum(e.output_tokens), 0)::bigint,
    coalesce(sum(e.cached_tokens), 0)::bigint,
    coalesce(sum(e.cost_usd), 0),
    count(*) filter (where e.status = 'ok' and e.cost_usd is null),
    max(e.created_at)
  from public.usage_events e
  where e.kind = 'ai_request' and e.created_at >= p_from and e.created_at < p_to
    and (select auth.role()) = 'service_role'
  group by 1, 2, 3
$$;

revoke execute on function public.admin_ai_usage(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_ai_usage(timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Uso do mês no painel: IA conta só o que chegou ao modelo
-- ---------------------------------------------------------------------------

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
        -- IA: só chamadas que contam no plano (sem erros e sem respostas do cache).
        sum(e.quantity) filter (where e.kind = 'ai_request' and e.status in ('ok', 'pendente')) as ai
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
revoke execute on function public.admin_org_usage() from public, anon, authenticated;
grant execute on function public.admin_org_usage() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Triagem: limite do plano não gasta tentativa
-- ---------------------------------------------------------------------------

drop function if exists public.save_triage_ai(uuid, jsonb, boolean, text, integer);
create or replace function public.save_triage_ai(
  p_id uuid, p_ai jsonb, p_ok boolean, p_review_reason text default null, p_retry_seconds integer default 3600,
  p_count_attempt boolean default true
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update triage_items t
     set ai = case when p_ok then p_ai else t.ai end,
         ai_status = case when p_ok then 'pronto' else 'falhou' end,
         ai_attempts = t.ai_attempts + case when p_ok or p_count_attempt then 1 else 0 end,
         ai_next_at = case when p_ok then null else now() + make_interval(secs => greatest(60, p_retry_seconds)) end,
         state = case when p_ok and p_review_reason is not null and t.state = 'pendente' then 'em_revisao' else t.state end,
         review_reason = case
           when p_ok and p_review_reason is not null and t.state = 'pendente' then left(p_review_reason, 1000)
           else t.review_reason end
   where t.id = p_id and t.ai_status <> 'pronto'
$$;

revoke execute on function public.save_triage_ai(uuid, jsonb, boolean, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.save_triage_ai(uuid, jsonb, boolean, text, integer, boolean) to service_role;

commit;

-- Conferência: consumo de IA do mês por escritório.
select o.name as "escritório", public.ai_monthly_used(o.id) as "chamadas no mês", public.ai_monthly_limit(o.id) as "limite"
  from public.organizations o
 order by 2 desc;
