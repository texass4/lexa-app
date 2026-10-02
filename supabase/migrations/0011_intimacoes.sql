-- Íntegra — intimações do DJEN: OABs, captura, triagem, auditoria.
--
-- Rode no SQL Editor do Supabase depois da 0006, 0008 e 0009. Pode rodar de novo sem erro.
--
-- 1. `lawyer_oabs`: inscrições na OAB (várias por advogado). As que já estavam no
--    campo de texto do perfil (`profiles.oab`) são importadas quando dá para ler
--    número e UF com segurança; o texto antigo não é apagado. Daqui em diante,
--    `profiles.oab` é só o resumo das inscrições ativas (mantido pelo banco).
-- 2. `djen_oab_state`: controle da captura por inscrição (número + UF), comum a
--    todos os escritórios — a mesma OAB nunca é consultada duas vezes no mesmo dia.
--    Só o servidor lê e grava.
-- 3. `intimacoes`: uma por comunicação por escritório (nunca duplicada). O teor e os
--    dados da fonte não podem ser alterados pelo app — só vínculo, responsável e
--    situação da triagem. Tempo real ligado.
-- 4. `intimacao_events`: trilha de auditoria (capturada, visualizou, vinculou,
--    confirmou/rejeitou prazo…), escrita pelo banco — não dá para pular nem editar.
-- 5. Timeline: ao vincular a um processo, o banco registra UMA atividade no processo.
-- 6. Prazo da intimação: no máximo um por intimação (`deadlines.data.intimacaoId`).
-- 7. `process_sync_runs.job`: as execuções da captura aparecem no mesmo painel do
--    monitoramento (Admin › Monitoramento).

begin;

-- Chave composta "membro deste escritório" (também criada pela 0002/0008).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_org_id_key') then
    alter table public.profiles add constraint profiles_org_id_key unique (organization_id, id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Inscrições na OAB
-- ---------------------------------------------------------------------------

create table if not exists public.lawyer_oabs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  number text not null check (number ~ '^[1-9][0-9]{0,6}$'),
  uf text not null check (uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
    'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.profiles (organization_id, id) on delete cascade,
  -- Uma inscrição pertence a uma pessoa do escritório.
  unique (organization_id, number, uf)
);

create index if not exists lawyer_oabs_user_idx on public.lawyer_oabs (user_id);
create index if not exists lawyer_oabs_active_idx on public.lawyer_oabs (number, uf) where active;

alter table public.lawyer_oabs enable row level security;
revoke all on public.lawyer_oabs from anon;

drop policy if exists lawyer_oabs_select on public.lawyer_oabs;
create policy lawyer_oabs_select on public.lawyer_oabs
  for select to authenticated using (organization_id = public.current_org_id());

-- A própria pessoa cuida das suas inscrições; quem gerencia usuários, das de todos.
drop policy if exists lawyer_oabs_insert on public.lawyer_oabs;
create policy lawyer_oabs_insert on public.lawyer_oabs
  for insert to authenticated
  with check (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_perm('users.manage')));

drop policy if exists lawyer_oabs_update on public.lawyer_oabs;
create policy lawyer_oabs_update on public.lawyer_oabs
  for update to authenticated
  using (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_perm('users.manage')))
  with check (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_perm('users.manage')));

drop policy if exists lawyer_oabs_delete on public.lawyer_oabs;
create policy lawyer_oabs_delete on public.lawyer_oabs
  for delete to authenticated
  using (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_perm('users.manage')));

drop trigger if exists lawyer_oabs_touch on public.lawyer_oabs;
create trigger lawyer_oabs_touch before update on public.lawyer_oabs
  for each row execute function public.touch_updated_at();

-- `profiles.oab` vira o resumo das inscrições ativas ("OAB/SC 12345, OAB/SP 98765").
create or replace function public.lawyer_oabs_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
begin
  update profiles
     set oab = (
       select string_agg('OAB/' || o.uf || ' ' || o.number, ', ' order by o.created_at)
         from lawyer_oabs o
        where o.user_id = target and o.active
     )
   where id = target;
  return null;
end
$$;

drop trigger if exists lawyer_oabs_sync_profile on public.lawyer_oabs;
create trigger lawyer_oabs_sync_profile after insert or update or delete on public.lawyer_oabs
  for each row execute function public.lawyer_oabs_sync_profile();

-- Importa o texto livre antigo (mesma leitura de `lib/intimacoes/oab.ts › parseOabText`).
do $$
declare
  p record;
  part text;
  found_uf text;
  found_number text;
begin
  for p in select id, organization_id, oab from public.profiles where organization_id is not null and coalesce(btrim(oab), '') <> ''
  loop
    foreach part in array regexp_split_to_array(upper(p.oab), '[;,]|\s+E\s+')
    loop
      found_uf := substring(part from '\m(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\M');
      found_number := ltrim(regexp_replace(coalesce(substring(part from '\d[\d.\s-]*\d|\d'), ''), '\D', '', 'g'), '0');
      if found_uf is not null and found_number ~ '^[1-9][0-9]{0,6}$' then
        insert into public.lawyer_oabs (organization_id, user_id, number, uf)
        values (p.organization_id, p.id, found_number, found_uf)
        on conflict (organization_id, number, uf) do nothing;
      end if;
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Controle da captura por inscrição (só o servidor)
-- ---------------------------------------------------------------------------

create table if not exists public.djen_oab_state (
  number text not null,
  uf text not null,
  -- Último dia de disponibilização já lido com sucesso.
  window_end date,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_result text,
  last_error text,
  last_found integer not null default 0,
  consecutive_failures integer not null default 0,
  next_check_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (number, uf)
);

alter table public.djen_oab_state enable row level security;
revoke all on public.djen_oab_state from anon, authenticated;

-- Inscrições ativas, de pessoas ativas, de escritórios ativos, com consulta vencida.
-- A mesma OAB em dois escritórios é UMA consulta.
create or replace function public.claim_djen_oabs(p_limit integer, p_lease_seconds integer default 900)
returns table (oab_number text, oab_uf text, window_end date, failures integer)
language sql
volatile
security definer
set search_path = public
as $$
  with candidates as (
    select distinct o.number, o.uf, s.last_checked_at
      from lawyer_oabs o
      join organizations org on org.id = o.organization_id and org.status = 'active'
      join profiles p on p.id = o.user_id and p.active
      left join djen_oab_state s on s.number = o.number and s.uf = o.uf
     where o.active
       and (s.next_check_at is null or s.next_check_at <= now())
     order by s.last_checked_at asc nulls first
     limit greatest(0, least(p_limit, 200))
  )
  insert into djen_oab_state as s (number, uf, next_check_at)
  select number, uf, now() + make_interval(secs => greatest(60, p_lease_seconds)) from candidates
  on conflict (number, uf) do update
    set next_check_at = excluded.next_check_at, updated_at = now()
    where s.next_check_at is null or s.next_check_at <= now()
  returning s.number, s.uf, s.window_end, s.consecutive_failures
$$;

revoke execute on function public.claim_djen_oabs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_djen_oabs(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Intimações
-- ---------------------------------------------------------------------------

create table if not exists public.intimacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source text not null default 'djen' check (source in ('djen')),
  external_id text not null,
  hash text,
  oab_ids uuid[] not null default '{}',
  responsible_id uuid,
  cnj text check (cnj is null or cnj ~ '^[0-9]{20}$'),
  process_number text,
  tribunal text,
  orgao text,
  tipo_comunicacao text,
  tipo_documento text,
  classe text,
  meio text,
  available_at date not null,
  published_at date,
  content text not null,
  document_url text,
  official_url text,
  parties jsonb not null default '[]',
  lawyers jsonb not null default '[]',
  raw jsonb,
  process_id text,
  client_id text,
  link_method text check (link_method in ('cnj', 'manual')),
  status text not null default 'sem_processo' check (status in ('pendente', 'revisao', 'sem_processo', 'confirmada', 'rejeitada')),
  suggestion jsonb,
  prazo_id text,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A mesma comunicação nunca entra duas vezes no mesmo escritório.
  unique (organization_id, source, external_id),
  foreign key (organization_id, process_id) references public.processes (organization_id, id) on delete set null (process_id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, responsible_id) references public.profiles (organization_id, id) on delete set null (responsible_id),
  foreign key (organization_id, prazo_id) references public.deadlines (organization_id, id) on delete set null (prazo_id)
);

create index if not exists intimacoes_triage_idx on public.intimacoes (organization_id, status, available_at desc);
create index if not exists intimacoes_process_idx on public.intimacoes (organization_id, process_id) where process_id is not null;
create index if not exists intimacoes_unlinked_idx on public.intimacoes (organization_id, cnj) where process_id is null and cnj is not null;

alter table public.intimacoes enable row level security;
revoke all on public.intimacoes from anon;

drop policy if exists intimacoes_select on public.intimacoes;
create policy intimacoes_select on public.intimacoes
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

-- O app só altera vínculo, responsável e triagem (o gatilho abaixo garante). Criar e
-- excluir: só o servidor.
drop policy if exists intimacoes_update on public.intimacoes;
create policy intimacoes_update on public.intimacoes
  for update to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.edit'))
  with check (organization_id = public.current_org_id() and public.has_perm('processes.edit'));

drop trigger if exists intimacoes_touch on public.intimacoes;
create trigger intimacoes_touch before insert or update on public.intimacoes
  for each row execute function public.bump_row_version();

-- Teor e dados da fonte são imutáveis para o app; a triagem segue regras simples.
create or replace function public.intimacoes_guard()
returns trigger
language plpgsql
as $$
declare
  editable text[] := array['process_id', 'client_id', 'link_method', 'status', 'prazo_id', 'responsible_id', 'decision_note', 'updated_at'];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
      raise exception 'O teor e os dados da fonte de uma intimação não podem ser alterados.' using errcode = 'check_violation';
    end if;
    if old.status in ('confirmada', 'rejeitada') and new.status is distinct from old.status then
      raise exception 'Intimação já decidida.' using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'confirmada' and new.prazo_id is null then
    raise exception 'Confirmar exige o prazo criado.' using errcode = 'check_violation';
  end if;
  if new.status in ('pendente', 'confirmada') and new.process_id is null then
    raise exception 'Vincule o processo antes.' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists intimacoes_guard on public.intimacoes;
create trigger intimacoes_guard before update on public.intimacoes
  for each row execute function public.intimacoes_guard();

-- ---------------------------------------------------------------------------
-- 4. Auditoria
-- ---------------------------------------------------------------------------

create table if not exists public.intimacao_events (
  id bigserial primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  intimacao_id uuid not null references public.intimacoes (id) on delete cascade,
  -- `null` = o sistema (captura, vinculação automática).
  actor_id uuid,
  action text not null check (action in (
    'capturada', 'visualizou', 'vinculou', 'desvinculou', 'atribuiu', 'confirmou_prazo', 'rejeitou_prazo', 'marcou_revisao')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists intimacao_events_idx on public.intimacao_events (intimacao_id, created_at);
-- "Visualizou" conta uma vez por pessoa (a primeira).
create unique index if not exists intimacao_events_viewed_once on public.intimacao_events (intimacao_id, actor_id) where action = 'visualizou';

alter table public.intimacao_events enable row level security;
revoke all on public.intimacao_events from anon, authenticated;
grant select on public.intimacao_events to authenticated;

drop policy if exists intimacao_events_select on public.intimacao_events;
create policy intimacao_events_select on public.intimacao_events
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

-- Hora local do escritório, no formato das datas do app (`YYYY-MM-DDTHH:MM:SS`).
create or replace function public.local_now_iso()
returns text
language sql
stable
as $$
  select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS')
$$;

-- Evento na trilha + atividade na timeline do processo (uma por vínculo).
create or replace function public.intimacoes_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  oab_text text;
  at text := local_now_iso();
begin
  if tg_op = 'INSERT' then
    insert into intimacao_events (organization_id, intimacao_id, actor_id, action, detail)
    values (new.organization_id, new.id, null, 'capturada', jsonb_build_object('source', new.source, 'externalId', new.external_id));
  end if;

  if new.process_id is not null and (tg_op = 'INSERT' or old.process_id is distinct from new.process_id) then
    insert into intimacao_events (organization_id, intimacao_id, actor_id, action, detail)
    values (new.organization_id, new.id, actor, 'vinculou', jsonb_build_object('processId', new.process_id, 'method', new.link_method));

    select 'OAB/' || o.uf || ' ' || o.number into oab_text from lawyer_oabs o where o.id = new.oab_ids[1];
    insert into activities (organization_id, id, data)
    values (
      new.organization_id,
      'act_int_' || new.id || '_' || new.process_id,
      jsonb_strip_nulls(jsonb_build_object(
        'id', 'act_int_' || new.id || '_' || new.process_id,
        'organizationId', new.organization_id,
        'createdAt', at,
        'at', at,
        'type', 'summons',
        'message', 'Intimação publicada em ' || to_char(coalesce(new.published_at, new.available_at), 'DD/MM/YYYY')
          || coalesce(' — ' || new.tribunal, '') || '.',
        'detail', nullif(concat_ws(' · ', new.tipo_comunicacao, oab_text, new.orgao), ''),
        'processId', new.process_id,
        'clientId', new.client_id,
        'actorUserId', coalesce(actor::text, 'integra'),
        'href', '/intimacoes?id=' || new.id
      ))
    )
    on conflict (organization_id, id) do nothing;
  end if;

  if tg_op = 'UPDATE' then
    if old.process_id is not null and new.process_id is null then
      insert into intimacao_events (organization_id, intimacao_id, actor_id, action, detail)
      values (new.organization_id, new.id, actor, 'desvinculou', jsonb_build_object('processId', old.process_id));
    end if;
    if old.responsible_id is distinct from new.responsible_id then
      insert into intimacao_events (organization_id, intimacao_id, actor_id, action, detail)
      values (new.organization_id, new.id, actor, 'atribuiu', jsonb_build_object('responsibleId', new.responsible_id));
    end if;
    if old.status is distinct from new.status and new.status in ('confirmada', 'rejeitada', 'revisao') then
      insert into intimacao_events (organization_id, intimacao_id, actor_id, action, detail)
      values (
        new.organization_id, new.id, actor,
        case new.status when 'confirmada' then 'confirmou_prazo' when 'rejeitada' then 'rejeitou_prazo' else 'marcou_revisao' end,
        jsonb_strip_nulls(jsonb_build_object('prazoId', new.prazo_id, 'note', new.decision_note))
      );
    end if;
  end if;
  return null;
end
$$;

revoke execute on function public.intimacoes_track() from public, anon, authenticated;

drop trigger if exists intimacoes_track on public.intimacoes;
create trigger intimacoes_track after insert or update on public.intimacoes
  for each row execute function public.intimacoes_track();

-- "Visualizou": uma vez por pessoa, só no próprio escritório.
create or replace function public.mark_intimacao_viewed(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from intimacoes where id = p_id;
  if org is null or org is distinct from current_org_id() or not has_perm('processes.view') then
    return;
  end if;
  insert into intimacao_events (organization_id, intimacao_id, actor_id, action)
  values (org, p_id, auth.uid(), 'visualizou')
  on conflict (intimacao_id, actor_id) where action = 'visualizou' do nothing;
end
$$;

revoke execute on function public.mark_intimacao_viewed(uuid) from public, anon;
grant execute on function public.mark_intimacao_viewed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Captura: gravação sem duplicar, processos por CNJ, revinculação
-- ---------------------------------------------------------------------------

-- Grava as comunicações capturadas. A mesma comunicação recebida por outra OAB do
-- escritório só acrescenta a inscrição; se nada mudou, não toca na linha. Devolve as
-- linhas gravadas e se cada uma é nova (`inserted`).
create or replace function public.save_intimacoes(p_rows jsonb)
returns table (intimacao_id uuid, organization_id uuid, inserted boolean, linked boolean)
language sql
volatile
security definer
set search_path = public
as $$
  insert into intimacoes as i (
    organization_id, source, external_id, hash, oab_ids, responsible_id, cnj, process_number, tribunal, orgao,
    tipo_comunicacao, tipo_documento, classe, meio, available_at, published_at, content, document_url, official_url,
    parties, lawyers, raw, process_id, client_id, link_method, status, suggestion
  )
  select
    r.organization_id, r.source, r.external_id, r.hash, r.oab_ids, r.responsible_id, r.cnj, r.process_number, r.tribunal, r.orgao,
    r.tipo_comunicacao, r.tipo_documento, r.classe, r.meio, r.available_at, r.published_at, r.content, r.document_url, r.official_url,
    coalesce(r.parties, '[]'), coalesce(r.lawyers, '[]'), r.raw, r.process_id, r.client_id, r.link_method, r.status, r.suggestion
  from jsonb_to_recordset(p_rows) as r (
    organization_id uuid, source text, external_id text, hash text, oab_ids uuid[], responsible_id uuid, cnj text,
    process_number text, tribunal text, orgao text, tipo_comunicacao text, tipo_documento text, classe text, meio text,
    available_at date, published_at date, content text, document_url text, official_url text, parties jsonb, lawyers jsonb,
    raw jsonb, process_id text, client_id text, link_method text, status text, suggestion jsonb
  )
  on conflict (organization_id, source, external_id) do update
    set oab_ids = array(select distinct unnest(i.oab_ids || excluded.oab_ids))
    where not (excluded.oab_ids <@ i.oab_ids)
  returning i.id, i.organization_id, (i.xmax::text = '0'), (i.process_id is not null)
$$;

revoke execute on function public.save_intimacoes(jsonb) from public, anon, authenticated;
grant execute on function public.save_intimacoes(jsonb) to service_role;

create index if not exists processes_cnj_idx on public.processes (
  organization_id, (coalesce(nullif(data ->> 'cnj', ''), regexp_replace(coalesce(data ->> 'number', ''), '\D', '', 'g')))
);

-- Processos do escritório com esses números (cadastrados com ou sem máscara).
create or replace function public.match_processes_by_cnj(p_org uuid, p_cnjs text[])
returns table (cnj text, process_id text, client_id text, owner_id text)
language sql
stable
security definer
set search_path = public
as $$
  select k.cnj, p.id, nullif(p.data ->> 'clientId', ''), nullif(p.data ->> 'ownerId', '')
    from processes p
    cross join lateral (
      select coalesce(nullif(p.data ->> 'cnj', ''), regexp_replace(coalesce(p.data ->> 'number', ''), '\D', '', 'g')) as cnj
    ) k
   where p.organization_id = p_org and k.cnj = any (p_cnjs)
$$;

revoke execute on function public.match_processes_by_cnj(uuid, text[]) from public, anon, authenticated;
grant execute on function public.match_processes_by_cnj(uuid, text[]) to service_role;

-- Intimações "sem processo" cujo número foi cadastrado depois: vincula quando há
-- exatamente UM processo com o número (mais de um = ambíguo, fica para a pessoa).
create or replace function public.relink_intimacoes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  with candidates as (
    select i.id, min(m.process_id) as process_id, min(m.client_id) as client_id
      from intimacoes i
      cross join lateral match_processes_by_cnj(i.organization_id, array[i.cnj]) m
     where i.status = 'sem_processo' and i.process_id is null and i.cnj is not null
     group by i.id
    having count(*) = 1
  )
  update intimacoes i
     set process_id = c.process_id,
         client_id = c.client_id,
         link_method = 'cnj',
         status = case when i.suggestion ->> 'confidence' = 'alta' then 'pendente' else 'revisao' end
    from candidates c
   where i.id = c.id;
  get diagnostics total = row_count;
  return total;
end
$$;

revoke execute on function public.relink_intimacoes() from public, anon, authenticated;
grant execute on function public.relink_intimacoes() to service_role;

-- ---------------------------------------------------------------------------
-- Prazo da intimação: no máximo um por intimação
-- ---------------------------------------------------------------------------

create unique index if not exists deadlines_intimacao_unique
  on public.deadlines (organization_id, (data ->> 'intimacaoId'))
  where data ? 'intimacaoId';

-- ---------------------------------------------------------------------------
-- Execuções: mesmo registro do monitoramento, separado por tarefa
-- ---------------------------------------------------------------------------

alter table public.process_sync_runs add column if not exists job text not null default 'processos';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_sync_runs_job_check') then
    alter table public.process_sync_runs add constraint process_sync_runs_job_check check (job in ('processos', 'intimacoes'));
  end if;
end
$$;
create index if not exists process_sync_runs_job_idx on public.process_sync_runs (job, started_at desc);

-- ---------------------------------------------------------------------------
-- Tempo real
-- ---------------------------------------------------------------------------

do $$
declare
  pub record;
begin
  select * into pub from pg_publication where pubname = 'supabase_realtime';
  if not found or pub.puballtables then
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intimacoes'
  ) then
    alter publication supabase_realtime add table public.intimacoes;
  end if;
end
$$;

commit;

-- Conferência: advogados sem OAB cadastrada (a tela pede para cadastrarem).
select p.name as "advogado sem OAB", p.oab as "texto antigo"
  from public.profiles p
 where p.role = 'lawyer' and p.active
   and not exists (select 1 from public.lawyer_oabs o where o.user_id = p.id and o.active);
