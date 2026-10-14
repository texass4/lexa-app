-- Íntegra — Jurisprudência: base pública indexada + salvas e vínculos por escritório.
--
-- Rode no SQL Editor do Supabase depois da 0018. Pode rodar de novo sem erro.
-- Documentação: docs/JURISPRUDENCIA.md.
--
-- 1. `jurisprudence`: base PÚBLICA, alimentada só pelo servidor a partir de fontes
--    oficiais (hoje: STJ — Portal de Dados Abertos). Uma linha por decisão, sem
--    escritório; nunca copiada por escritório. Membros ativos leem; ninguém escreve
--    pela API (só a service role, na sincronização).
-- 2. `jurisprudence_sync_runs` / `jurisprudence_sync_files`: log e controle de
--    idempotência da sincronização (só servidor).
-- 3. `saved_jurisprudence` e `process_jurisprudence`: o que é DO ESCRITÓRIO — RLS por
--    `organization_id = current_org_id()`. Um escritório nunca vê os de outro.
-- 4. Busca em português sem acento (`pt_juris`), índice GIN e a função
--    `search_jurisprudence` (security invoker: vale a RLS de quem chama).

begin;

create extension if not exists unaccent with schema extensions;

-- ----------------------------------------------------- busca em português
do $$
begin
  if not exists (select 1 from pg_ts_config where cfgname = 'pt_juris' and cfgnamespace = 'public'::regnamespace) then
    create text search configuration public.pt_juris (copy = pg_catalog.portuguese);
    alter text search configuration public.pt_juris
      alter mapping for hword, hword_part, word with extensions.unaccent, portuguese_stem;
  end if;
end
$$;

-- ------------------------------------------------------- 1. base pública
create table if not exists public.jurisprudence (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  tribunal text not null,
  external_id text not null,
  process_number text,
  registry_number text,
  class_code text,
  class_name text,
  court text,
  rapporteur text,
  judgment_date date,
  publication_date date,
  publication text,
  decision_type text,
  subject text,
  ementa text not null,
  decision_text text,
  thesis text,
  keywords text,
  legislation text[] not null default '{}',
  cited_precedents text,
  notes text,
  area text,
  degree text,
  source_url text,
  raw_reference jsonb not null default '{}'::jsonb,
  content_hash text not null,
  search tsvector generated always as (
    setweight(to_tsvector('public.pt_juris'::regconfig, coalesce(subject, '') || ' ' || coalesce(ementa, '')), 'A') ||
    setweight(to_tsvector('public.pt_juris'::regconfig, coalesce(thesis, '') || ' ' || coalesce(class_name, '') || ' ' || coalesce(keywords, '')), 'B') ||
    setweight(to_tsvector('public.pt_juris'::regconfig, coalesce(left(decision_text, 200000), '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deduplicação: a mesma decisão da mesma fonte é sempre a mesma linha.
  constraint jurisprudence_source_key unique (provider, tribunal, external_id),
  constraint jurisprudence_url check (source_url is null or source_url ~ '^https://')
);

create index if not exists jurisprudence_search_idx on public.jurisprudence using gin (search);
create index if not exists jurisprudence_date_idx on public.jurisprudence (judgment_date desc nulls last, id);
create index if not exists jurisprudence_filters_idx on public.jurisprudence (tribunal, court, class_code);
create index if not exists jurisprudence_area_idx on public.jurisprudence (area);

drop trigger if exists jurisprudence_touch on public.jurisprudence;
create trigger jurisprudence_touch before update on public.jurisprudence for each row execute function public.touch_updated_at();

alter table public.jurisprudence enable row level security;
revoke all on public.jurisprudence from public, anon, authenticated;
grant select on public.jurisprudence to authenticated;
grant all on public.jurisprudence to service_role;

drop policy if exists jurisprudence_select on public.jurisprudence;
create policy jurisprudence_select on public.jurisprudence
  for select to authenticated
  using (public.current_org_id() is not null and public.has_perm('processes.view'));

-- --------------------------------------------------- 2. sincronização
create table if not exists public.jurisprudence_sync_runs (
  id bigint generated always as identity primary key,
  provider text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  records_fetched integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  files_processed integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb
);
create index if not exists jurisprudence_sync_runs_recent on public.jurisprudence_sync_runs (provider, started_at desc);

create table if not exists public.jurisprudence_sync_files (
  provider text not null,
  dataset text not null,
  resource_id text not null,
  resource_name text,
  resource_url text,
  records integer not null default 0,
  processed_at timestamptz not null default now(),
  primary key (provider, resource_id)
);

alter table public.jurisprudence_sync_runs enable row level security;
alter table public.jurisprudence_sync_files enable row level security;
revoke all on public.jurisprudence_sync_runs from public, anon, authenticated;
revoke all on public.jurisprudence_sync_files from public, anon, authenticated;
grant all on public.jurisprudence_sync_runs to service_role;
grant all on public.jurisprudence_sync_files to service_role;

-- ------------------------------------------------ 3. do escritório
create table if not exists public.saved_jurisprudence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  jurisprudence_id uuid not null references public.jurisprudence (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_jurisprudence_once unique (organization_id, jurisprudence_id)
);
create index if not exists saved_jurisprudence_recent on public.saved_jurisprudence (organization_id, created_at desc);

drop trigger if exists saved_jurisprudence_touch on public.saved_jurisprudence;
create trigger saved_jurisprudence_touch before update on public.saved_jurisprudence for each row execute function public.touch_updated_at();

create table if not exists public.process_jurisprudence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  process_id text not null,
  jurisprudence_id uuid not null references public.jurisprudence (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- O processo é do mesmo escritório do vínculo (chave composta): nada cruza escritórios.
  constraint process_jurisprudence_process foreign key (organization_id, process_id)
    references public.processes (organization_id, id) on delete cascade,
  constraint process_jurisprudence_once unique (organization_id, process_id, jurisprudence_id)
);
create index if not exists process_jurisprudence_by_decision on public.process_jurisprudence (organization_id, jurisprudence_id);

alter table public.saved_jurisprudence enable row level security;
alter table public.process_jurisprudence enable row level security;
revoke all on public.saved_jurisprudence from public, anon;
revoke all on public.process_jurisprudence from public, anon;
grant select, insert, update, delete on public.saved_jurisprudence to authenticated;
grant select, insert, delete on public.process_jurisprudence to authenticated;
grant all on public.saved_jurisprudence to service_role;
grant all on public.process_jurisprudence to service_role;

drop policy if exists saved_jurisprudence_select on public.saved_jurisprudence;
create policy saved_jurisprudence_select on public.saved_jurisprudence
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));
drop policy if exists saved_jurisprudence_insert on public.saved_jurisprudence;
create policy saved_jurisprudence_insert on public.saved_jurisprudence
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_perm('processes.view') and created_by = auth.uid());
drop policy if exists saved_jurisprudence_update on public.saved_jurisprudence;
create policy saved_jurisprudence_update on public.saved_jurisprudence
  for update to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'))
  with check (organization_id = public.current_org_id() and public.has_perm('processes.view'));
drop policy if exists saved_jurisprudence_delete on public.saved_jurisprudence;
create policy saved_jurisprudence_delete on public.saved_jurisprudence
  for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

drop policy if exists process_jurisprudence_select on public.process_jurisprudence;
create policy process_jurisprudence_select on public.process_jurisprudence
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));
drop policy if exists process_jurisprudence_insert on public.process_jurisprudence;
create policy process_jurisprudence_insert on public.process_jurisprudence
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_perm('processes.edit') and created_by = auth.uid());
drop policy if exists process_jurisprudence_delete on public.process_jurisprudence;
create policy process_jurisprudence_delete on public.process_jurisprudence
  for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.edit'));

-- ------------------------------------------------------------- 4. busca
-- Linguagem natural: qualquer termo encontra (OU), e quem tem todos os termos sobe
-- (+1). Aspas e "-termo" funcionam como na busca da web. Filtros em `p_filters`:
-- tribunal, degree, court, class, subject, area, from, to (datas AAAA-MM-DD).
create or replace function public.search_jurisprudence(
  p_query text,
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'relevance',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  provider text,
  tribunal text,
  process_number text,
  class_code text,
  class_name text,
  court text,
  rapporteur text,
  judgment_date date,
  subject text,
  area text,
  degree text,
  source_url text,
  snippet text,
  score real,
  total bigint
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_text text := nullif(btrim(coalesce(p_query, '')), '');
  v_and tsquery;
  v_or tsquery;
  v_or_text text;
  v_from date := nullif(p_filters ->> 'from', '')::date;
  v_to date := nullif(p_filters ->> 'to', '')::date;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 5000);
begin
  if v_text is not null then
    v_text := left(v_text, 300);
    v_and := websearch_to_tsquery('public.pt_juris'::regconfig, v_text);
    v_or_text := replace(plainto_tsquery('public.pt_juris'::regconfig, v_text)::text, ' & ', ' | ');
    -- Só palavras vazias ("de", "para"…): nada a procurar.
    if v_or_text = '' then
      return;
    end if;
    v_or := v_or_text::tsquery;
  end if;

  return query
  with hits as (
    select j.*,
      case when v_or is null then 0::real
           else ts_rank_cd(j.search, v_or, 32) + case when j.search @@ v_and then 1 else 0 end
      end as rank,
      count(*) over () as total_count
    from public.jurisprudence j
    where (v_or is null or j.search @@ v_or)
      and (nullif(p_filters ->> 'tribunal', '') is null or j.tribunal = p_filters ->> 'tribunal')
      and (nullif(p_filters ->> 'degree', '') is null or j.degree = p_filters ->> 'degree')
      and (nullif(p_filters ->> 'court', '') is null or j.court = p_filters ->> 'court')
      and (nullif(p_filters ->> 'class', '') is null or j.class_code = p_filters ->> 'class')
      and (nullif(p_filters ->> 'area', '') is null or j.area = p_filters ->> 'area')
      and (nullif(p_filters ->> 'subject', '') is null
           or extensions.unaccent(coalesce(j.subject, '')) ilike '%' || extensions.unaccent(p_filters ->> 'subject') || '%')
      and (v_from is null or j.judgment_date >= v_from)
      and (v_to is null or j.judgment_date <= v_to)
  ),
  page as (
    select * from hits h
    order by
      case when p_sort = 'recent' or v_or is null then 0 else h.rank end desc,
      h.judgment_date desc nulls last,
      h.id
    limit v_limit offset v_offset
  )
  select p.id, p.provider, p.tribunal, p.process_number, p.class_code, p.class_name, p.court, p.rapporteur,
    p.judgment_date, p.subject, p.area, p.degree, p.source_url,
    case when v_or is null then left(p.ementa, 420)
         else ts_headline('public.pt_juris'::regconfig, p.ementa, v_or,
                'MaxFragments=2, MinWords=14, MaxWords=38, FragmentDelimiter=" … ", StartSel=⟦, StopSel=⟧')
    end,
    p.rank::real,
    p.total_count
  from page p
  order by case when p_sort = 'recent' or v_or is null then 0 else p.rank end desc, p.judgment_date desc nulls last, p.id;
end
$$;

revoke all on function public.search_jurisprudence(text, jsonb, text, integer, integer) from public, anon;
grant execute on function public.search_jurisprudence(text, jsonb, text, integer, integer) to authenticated;

-- Opções dos filtros (valores que existem na base) — leitura pela RLS de quem chama.
create or replace function public.jurisprudence_facets()
returns table (kind text, value text, label text, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select 'tribunal', tribunal, tribunal, count(*) from public.jurisprudence group by tribunal
  union all
  select 'degree', degree, degree, count(*) from public.jurisprudence where degree is not null group by degree
  union all
  select 'court', court, court, count(*) from public.jurisprudence where court is not null group by court
  union all
  select 'class', class_code, max(coalesce(class_name, class_code)), count(*) from public.jurisprudence where class_code is not null group by class_code
  union all
  select 'area', area, area, count(*) from public.jurisprudence where area is not null group by area
$$;
revoke all on function public.jurisprudence_facets() from public, anon;
grant execute on function public.jurisprudence_facets() to authenticated;

-- Situação da base para a tela (só números: o log completo fica com o servidor).
create or replace function public.jurisprudence_status()
returns table (provider text, decisions bigint, last_success timestamptz, last_status text)
language sql
stable
security definer
set search_path = public
as $$
  select p.provider,
    (select count(*) from public.jurisprudence j where j.provider = p.provider),
    (select max(r.finished_at) from public.jurisprudence_sync_runs r where r.provider = p.provider and r.status in ('success', 'partial')),
    (select r.status from public.jurisprudence_sync_runs r where r.provider = p.provider order by r.started_at desc limit 1)
  from (
    select distinct provider from public.jurisprudence
    union
    select distinct provider from public.jurisprudence_sync_runs
  ) p
  where public.current_org_id() is not null
$$;
revoke all on function public.jurisprudence_status() from public, anon;
grant execute on function public.jurisprudence_status() to authenticated;

commit;
