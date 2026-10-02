-- Íntegra — Triagem jurídica: uma caixa única para os eventos que podem exigir ação.
--
-- Rode no SQL Editor do Supabase depois da 0011. Pode rodar de novo sem erro.
--
-- A 0011 criou as intimações do DJEN já com a triagem dentro delas. Aqui a triagem
-- vira uma camada própria, comum a todas as fontes:
--
--   DJEN (intimações)            ┐
--   DataJud (movimentações)      ├→ triage_items → decisão → Prazo (Etapa 4)
--   próximas fontes              ┘
--
-- 1. `triage_items`: um evento por escritório (nunca duplicado: fonte + chave de
--    origem). Estado persistido — pendente, em_revisao, decidido, ignorado — com quem
--    decidiu e quando (gravados pelo banco). A interpretação da IA fica guardada e é
--    gerada uma vez só.
-- 2. `triage_events`: trilha de auditoria (capturado, visualizou, vinculou, confirmou,
--    rejeitou, ignorou, reabriu, interpretou…), escrita pelo banco.
-- 3. `intimacoes` passa a guardar só a comunicação como veio da fonte (teor original,
--    datas, OABs) e não pode mais ser alterada pelo app. O que já estava triado na
--    0011 (vínculo, situação, prazo, trilha) é copiado para a triagem.
-- 4. Timeline: vincular uma intimação a um processo registra UMA atividade nele (a
--    mesma chave da 0011 — nada se repete). Movimentações já estão na timeline.
-- 5. Prazos: origem `movimentacao` e no máximo um prazo por evento da triagem.

begin;

-- ---------------------------------------------------------------------------
-- 1. Eventos da triagem
-- ---------------------------------------------------------------------------

create table if not exists public.triage_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('intimacao', 'movimentacao')),
  source text not null check (source in ('djen', 'datajud')),
  -- Identidade do evento na fonte (id da comunicação, hash da movimentação).
  source_key text not null,
  intimacao_id uuid unique references public.intimacoes (id) on delete cascade,
  process_id text,
  client_id text,
  link_method text check (link_method in ('cnj', 'manual', 'processo')),
  cnj text check (cnj is null or cnj ~ '^[0-9]{20}$'),
  process_number text,
  -- Publicação (intimação) ou data do ato (movimentação).
  event_date date not null,
  available_at date,
  title text not null check (char_length(title) between 1 and 200),
  -- Trecho legível do original, para a lista. O original fica na fonte (`intimacoes`).
  excerpt text check (excerpt is null or char_length(excerpt) <= 600),
  tribunal text,
  orgao text,
  responsible_id uuid,
  -- Sugestão de prazo calculada pelas regras (`lib/intimacoes/deadline.ts`).
  suggestion jsonb,
  -- Interpretação da IA: gerada uma vez, guardada, nunca substitui o original.
  ai jsonb,
  ai_status text not null default 'pendente' check (ai_status in ('pendente', 'pronto', 'falhou')),
  ai_attempts integer not null default 0,
  ai_next_at timestamptz,
  state text not null default 'pendente' check (state in ('pendente', 'em_revisao', 'decidido', 'ignorado')),
  decision text check (decision in ('prazo_criado', 'sem_prazo')),
  review_reason text check (review_reason is null or char_length(review_reason) <= 1000),
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  prazo_id text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint triage_items_decision check (state <> 'decidido' or decision is not null),
  unique (organization_id, source, source_key),
  foreign key (organization_id, process_id) references public.processes (organization_id, id) on delete set null (process_id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, responsible_id) references public.profiles (organization_id, id) on delete set null (responsible_id),
  foreign key (organization_id, decided_by) references public.profiles (organization_id, id) on delete set null (decided_by),
  foreign key (organization_id, prazo_id) references public.deadlines (organization_id, id) on delete set null (prazo_id)
);

create index if not exists triage_items_open_idx on public.triage_items (organization_id, state, event_date desc);
create index if not exists triage_items_process_idx on public.triage_items (organization_id, process_id) where process_id is not null;
create index if not exists triage_items_unlinked_idx on public.triage_items (organization_id, cnj) where process_id is null and cnj is not null;
create index if not exists triage_items_ai_idx on public.triage_items (ai_next_at) where ai_status <> 'pronto' and state in ('pendente', 'em_revisao');

alter table public.triage_items enable row level security;
revoke all on public.triage_items from anon;

drop policy if exists triage_items_select on public.triage_items;
create policy triage_items_select on public.triage_items
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

-- O app só decide (vínculo, responsável, estado) — o gatilho abaixo garante. Criar e
-- excluir: só o servidor.
drop policy if exists triage_items_update on public.triage_items;
create policy triage_items_update on public.triage_items
  for update to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.edit'))
  with check (organization_id = public.current_org_id() and public.has_perm('processes.edit'));

-- ---------------------------------------------------------------------------
-- 2. Auditoria
-- ---------------------------------------------------------------------------

create table if not exists public.triage_events (
  id bigserial primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.triage_items (id) on delete cascade,
  -- `null` = a Íntegra (captura, vinculação automática, IA).
  actor_id uuid,
  action text not null check (action in (
    'capturado', 'visualizou', 'vinculou', 'desvinculou', 'atribuiu', 'marcou_revisao',
    'confirmou_prazo', 'rejeitou_prazo', 'ignorou', 'reabriu', 'interpretou')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists triage_events_idx on public.triage_events (item_id, created_at);
create unique index if not exists triage_events_viewed_once on public.triage_events (item_id, actor_id) where action = 'visualizou';

alter table public.triage_events enable row level security;
revoke all on public.triage_events from anon, authenticated;
grant select on public.triage_events to authenticated;

drop policy if exists triage_events_select on public.triage_events;
create policy triage_events_select on public.triage_events
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

-- ---------------------------------------------------------------------------
-- 3. O que a 0011 já tinha triado vem para cá (uma vez só)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'intimacoes' and column_name = 'status'
  ) then
    insert into public.triage_items (
      id, organization_id, kind, source, source_key, intimacao_id, process_id, client_id, link_method, cnj,
      process_number, event_date, available_at, title, excerpt, tribunal, orgao, responsible_id, suggestion,
      state, decision, review_reason, decision_note, prazo_id, decided_by, decided_at, created_at
    )
    select
      i.id, i.organization_id, 'intimacao', i.source, i.external_id, i.id, i.process_id, i.client_id, i.link_method, i.cnj,
      i.process_number, coalesce(i.published_at, i.available_at), i.available_at,
      left(coalesce(nullif(btrim(i.tipo_documento), ''), nullif(btrim(i.tipo_comunicacao), ''), 'Intimação'), 200),
      left(btrim(regexp_replace(regexp_replace(i.content, '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g')), 600),
      i.tribunal, i.orgao, i.responsible_id, i.suggestion,
      case i.status when 'revisao' then 'em_revisao' when 'confirmada' then 'decidido' when 'rejeitada' then 'decidido' else 'pendente' end,
      case i.status when 'confirmada' then 'prazo_criado' when 'rejeitada' then 'sem_prazo' end,
      case when i.status = 'revisao' then i.decision_note end,
      case when i.status <> 'revisao' then i.decision_note end,
      i.prazo_id, d.actor_id, d.created_at, i.created_at
    from public.intimacoes i
    left join lateral (
      select e.actor_id, e.created_at
        from public.intimacao_events e
       where e.intimacao_id = i.id and e.action in ('confirmou_prazo', 'rejeitou_prazo')
       order by e.created_at desc
       limit 1
    ) d on true
    on conflict do nothing;

    insert into public.triage_events (organization_id, item_id, actor_id, action, detail, created_at)
    select e.organization_id, e.intimacao_id, e.actor_id, case e.action when 'capturada' then 'capturado' else e.action end, e.detail, e.created_at
      from public.intimacao_events e
      join public.triage_items t on t.id = e.intimacao_id
    on conflict do nothing;
  end if;
end
$$;

-- Links antigos da timeline apontavam para a página de intimações, que deixou de existir.
update public.activities
   set data = jsonb_set(data, '{href}', to_jsonb(replace(data ->> 'href', '/intimacoes?id=', '/triagem?id=')))
 where data ->> 'href' like '/intimacoes?id=%';

-- A intimação agora é só a fonte: nada de triagem dentro dela, nada editável pelo app.
drop trigger if exists intimacoes_guard on public.intimacoes;
drop trigger if exists intimacoes_track on public.intimacoes;
drop function if exists public.intimacoes_guard();
drop function if exists public.intimacoes_track();
drop function if exists public.relink_intimacoes();
drop function if exists public.mark_intimacao_viewed(uuid);
drop policy if exists intimacoes_update on public.intimacoes;
drop table if exists public.intimacao_events;
alter table public.intimacoes
  drop column if exists process_id,
  drop column if exists client_id,
  drop column if exists link_method,
  drop column if exists status,
  drop column if exists suggestion,
  drop column if exists prazo_id,
  drop column if exists responsible_id,
  drop column if exists decision_note;

-- ---------------------------------------------------------------------------
-- 4. Regras da triagem (o banco garante, qualquer que seja a tela)
-- ---------------------------------------------------------------------------

drop trigger if exists triage_items_touch on public.triage_items;
create trigger triage_items_touch before insert or update on public.triage_items
  for each row execute function public.bump_row_version();

create or replace function public.triage_items_guard()
returns trigger
language plpgsql
as $$
declare
  editable text[] := array[
    'process_id', 'client_id', 'link_method', 'responsible_id', 'state', 'decision', 'review_reason',
    'decision_note', 'prazo_id', 'decided_by', 'decided_at', 'updated_at'];
  from_app boolean := coalesce(auth.role(), '') <> 'service_role';
begin
  if from_app then
    -- Origem, datas, sugestão e interpretação da IA: só o servidor escreve.
    if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
      raise exception 'Os dados de origem do evento não podem ser alterados.' using errcode = 'check_violation';
    end if;

    if old.state in ('decidido', 'ignorado') then
      if new.state is distinct from old.state then
        -- Reabrir só o que não gerou prazo.
        if not (new.state = 'pendente' and (old.state = 'ignorado' or old.decision = 'sem_prazo')) then
          raise exception 'Evento já decidido.' using errcode = 'check_violation';
        end if;
      elsif new.decision is distinct from old.decision
         or (new.process_id is distinct from old.process_id and new.process_id is not null)
         or (new.prazo_id is distinct from old.prazo_id and new.prazo_id is not null) then
        -- Decidido não muda (o banco ainda pode limpar vínculos excluídos).
        raise exception 'Evento já decidido.' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.state = 'decidido' then
    if new.decision is null then
      raise exception 'Informe a decisão.' using errcode = 'check_violation';
    end if;
    if new.decision = 'sem_prazo' then
      new.prazo_id := null;
    elsif old.decision is distinct from 'prazo_criado' then
      if new.process_id is null or new.prazo_id is null then
        raise exception 'Confirmar exige o processo e o prazo criado.' using errcode = 'check_violation';
      end if;
      -- O prazo precisa ser deste evento.
      if not exists (
        select 1 from deadlines d
         where d.organization_id = new.organization_id and d.id = new.prazo_id
           and (d.data ->> 'triageItemId' = new.id::text or d.data ->> 'intimacaoId' = new.id::text)
      ) then
        raise exception 'O prazo informado não é deste evento.' using errcode = 'check_violation';
      end if;
    end if;
  else
    new.decision := null;
    if new.state <> 'ignorado' then
      new.prazo_id := null;
    end if;
  end if;

  -- Quem decidiu e quando: a pessoa logada, agora. Não dá para informar outro.
  if new.state in ('decidido', 'ignorado') then
    if old.state is distinct from new.state or old.decision is distinct from new.decision then
      new.decided_by := auth.uid();
      new.decided_at := now();
    else
      new.decided_by := old.decided_by;
      new.decided_at := old.decided_at;
    end if;
  else
    new.decided_by := null;
    new.decided_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists triage_items_guard on public.triage_items;
create trigger triage_items_guard before update on public.triage_items
  for each row execute function public.triage_items_guard();

-- Hora local do escritório (também criada pela 0011).
create or replace function public.local_now_iso()
returns text
language sql
stable
as $$
  select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS')
$$;

-- Trilha de auditoria + atividade na timeline do processo (uma por vínculo).
create or replace function public.triage_items_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  oab_text text;
  at text := local_now_iso();
  activity_id text;
begin
  if tg_op = 'INSERT' then
    insert into triage_events (organization_id, item_id, actor_id, action, detail)
    values (new.organization_id, new.id, null, 'capturado', jsonb_build_object('source', new.source, 'kind', new.kind));
  end if;

  if new.process_id is not null and (tg_op = 'INSERT' or old.process_id is distinct from new.process_id) then
    insert into triage_events (organization_id, item_id, actor_id, action, detail)
    values (new.organization_id, new.id, actor, 'vinculou', jsonb_build_object('processId', new.process_id, 'method', new.link_method));

    -- Movimentações já estão na timeline do processo; a intimação entra uma vez.
    if new.kind = 'intimacao' then
      select 'OAB/' || o.uf || ' ' || o.number into oab_text
        from intimacoes i join lawyer_oabs o on o.id = i.oab_ids[1]
       where i.id = new.intimacao_id;
      -- Mesma chave da 0011: o vínculo que já tinha atividade não ganha outra.
      activity_id := 'act_int_' || coalesce(new.intimacao_id, new.id) || '_' || new.process_id;
      insert into activities (organization_id, id, data)
      values (
        new.organization_id,
        activity_id,
        jsonb_strip_nulls(jsonb_build_object(
          'id', activity_id,
          'organizationId', new.organization_id,
          'createdAt', at,
          'at', at,
          'type', 'summons',
          'message', 'Intimação publicada em ' || to_char(new.event_date, 'DD/MM/YYYY') || coalesce(' — ' || new.tribunal, '') || '.',
          'detail', nullif(concat_ws(' · ', new.title, oab_text, new.orgao), ''),
          'processId', new.process_id,
          'clientId', new.client_id,
          'actorUserId', coalesce(actor::text, 'integra'),
          'href', '/triagem?id=' || new.id
        ))
      )
      on conflict (organization_id, id) do nothing;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.process_id is not null and new.process_id is null then
      insert into triage_events (organization_id, item_id, actor_id, action, detail)
      values (new.organization_id, new.id, actor, 'desvinculou', jsonb_build_object('processId', old.process_id));
    end if;
    if old.responsible_id is distinct from new.responsible_id and new.responsible_id is not null then
      insert into triage_events (organization_id, item_id, actor_id, action, detail)
      values (new.organization_id, new.id, actor, 'atribuiu', jsonb_build_object('responsibleId', new.responsible_id));
    end if;
    if old.state is distinct from new.state or old.decision is distinct from new.decision then
      insert into triage_events (organization_id, item_id, actor_id, action, detail)
      values (
        new.organization_id, new.id, actor,
        case
          when new.state = 'em_revisao' then 'marcou_revisao'
          when new.state = 'decidido' and new.decision = 'prazo_criado' then 'confirmou_prazo'
          when new.state = 'decidido' then 'rejeitou_prazo'
          when new.state = 'ignorado' then 'ignorou'
          else 'reabriu'
        end,
        jsonb_strip_nulls(jsonb_build_object(
          'prazoId', new.prazo_id,
          'note', case when new.state = 'em_revisao' then new.review_reason else new.decision_note end
        ))
      );
    end if;
    if old.ai_status is distinct from new.ai_status and new.ai_status = 'pronto' then
      insert into triage_events (organization_id, item_id, actor_id, action, detail)
      values (new.organization_id, new.id, null, 'interpretou', jsonb_strip_nulls(jsonb_build_object('model', new.ai ->> 'model')));
    end if;
  end if;
  return null;
end
$$;

revoke execute on function public.triage_items_track() from public, anon, authenticated;

drop trigger if exists triage_items_track on public.triage_items;
create trigger triage_items_track after insert or update on public.triage_items
  for each row execute function public.triage_items_track();

-- "Visualizou": uma vez por pessoa, só no próprio escritório.
create or replace function public.mark_triage_viewed(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from triage_items where id = p_id;
  if org is null or org is distinct from current_org_id() or not has_perm('processes.view') then
    return;
  end if;
  insert into triage_events (organization_id, item_id, actor_id, action)
  values (org, p_id, auth.uid(), 'visualizou')
  on conflict (item_id, actor_id) where action = 'visualizou' do nothing;
end
$$;

revoke execute on function public.mark_triage_viewed(uuid) from public, anon;
grant execute on function public.mark_triage_viewed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Entrada de eventos (todas as fontes pelo mesmo caminho) — só o servidor
-- ---------------------------------------------------------------------------

-- Grava eventos novos; o que já existe (mesma fonte + chave) fica como está. Processo,
-- cliente e responsável só entram se existem no escritório. Devolve quantos entraram.
create or replace function public.save_triage_items(p_items jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  total integer;
begin
  insert into triage_items (
    id, organization_id, kind, source, source_key, intimacao_id, process_id, client_id, link_method, cnj,
    process_number, event_date, available_at, title, excerpt, tribunal, orgao, responsible_id, suggestion, state, review_reason
  )
  select
    coalesce(r.id, gen_random_uuid()), r.organization_id, r.kind, r.source, r.source_key, r.intimacao_id,
    p.id, c.id, case when p.id is not null then coalesce(r.link_method, 'cnj') end, r.cnj,
    r.process_number, r.event_date, r.available_at, left(btrim(r.title), 200), left(r.excerpt, 600), r.tribunal, r.orgao,
    m.id, r.suggestion, case when r.state = 'em_revisao' then 'em_revisao' else 'pendente' end, left(r.review_reason, 1000)
  from jsonb_to_recordset(p_items) as r (
    id uuid, organization_id uuid, kind text, source text, source_key text, intimacao_id uuid, process_id text,
    client_id text, link_method text, cnj text, process_number text, event_date date, available_at date, title text,
    excerpt text, tribunal text, orgao text, responsible_id text, suggestion jsonb, state text, review_reason text
  )
  left join processes p on p.organization_id = r.organization_id and p.id = r.process_id
  left join clients c on c.organization_id = r.organization_id and c.id = coalesce(r.client_id, p.data ->> 'clientId')
  left join profiles m on m.organization_id = r.organization_id and m.id::text = r.responsible_id and m.active
  on conflict (organization_id, source, source_key) do nothing;
  get diagnostics total = row_count;
  return total;
end
$$;

revoke execute on function public.save_triage_items(jsonb) from public, anon, authenticated;
grant execute on function public.save_triage_items(jsonb) to service_role;

-- DJEN: a comunicação como veio (sem duplicar; outra OAB do escritório só acrescenta a
-- inscrição) e, se é nova, o evento na triagem — na mesma transação.
drop function if exists public.save_intimacoes(jsonb);
create function public.save_intimacoes(p_rows jsonb)
returns table (intimacao_id uuid, organization_id uuid, inserted boolean, linked boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  saved jsonb;
begin
  with s as (
    insert into intimacoes as i (
      organization_id, source, external_id, hash, oab_ids, cnj, process_number, tribunal, orgao, tipo_comunicacao,
      tipo_documento, classe, meio, available_at, published_at, content, document_url, official_url, parties, lawyers, raw
    )
    select
      r.organization_id, r.source, r.external_id, r.hash, r.oab_ids, r.cnj, r.process_number, r.tribunal, r.orgao, r.tipo_comunicacao,
      r.tipo_documento, r.classe, r.meio, r.available_at, r.published_at, r.content, r.document_url, r.official_url,
      coalesce(r.parties, '[]'), coalesce(r.lawyers, '[]'), r.raw
    from jsonb_to_recordset(p_rows) as r (
      organization_id uuid, source text, external_id text, hash text, oab_ids uuid[], cnj text, process_number text,
      tribunal text, orgao text, tipo_comunicacao text, tipo_documento text, classe text, meio text, available_at date,
      published_at date, content text, document_url text, official_url text, parties jsonb, lawyers jsonb, raw jsonb
    )
    on conflict (organization_id, source, external_id) do update
      set oab_ids = array(select distinct unnest(i.oab_ids || excluded.oab_ids))
      where not (excluded.oab_ids <@ i.oab_ids)
    returning i.id, i.organization_id, i.source, i.external_id, (i.xmax::text = '0') as is_new
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'organization_id', s.organization_id, 'source', s.source, 'external_id', s.external_id, 'is_new', s.is_new)), '[]')
    into saved
    from s;

  perform save_triage_items(coalesce((
    select jsonb_agg(n.triage || jsonb_build_object(
      'id', x.id, 'organization_id', x.organization_id, 'kind', 'intimacao', 'source', x.source,
      'source_key', x.external_id, 'intimacao_id', x.id))
      from jsonb_to_recordset(saved) as x (id uuid, organization_id uuid, source text, external_id text, is_new boolean)
      join jsonb_to_recordset(p_rows) as n (organization_id uuid, external_id text, triage jsonb)
        on n.organization_id = x.organization_id and n.external_id = x.external_id
     where x.is_new and n.triage is not null
  ), '[]'));

  return query
    select x.id, x.organization_id, x.is_new,
           exists (select 1 from triage_items t where t.id = x.id and t.process_id is not null)
      from jsonb_to_recordset(saved) as x (id uuid, organization_id uuid, source text, external_id text, is_new boolean);
end
$$;

revoke execute on function public.save_intimacoes(jsonb) from public, anon, authenticated;
grant execute on function public.save_intimacoes(jsonb) to service_role;

-- Eventos "sem processo" cujo número foi cadastrado depois: vincula quando há
-- exatamente UM processo com o número (mais de um = ambíguo, fica para a pessoa).
create or replace function public.relink_triage_items()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  with candidates as (
    select t.id, min(m.process_id) as process_id, min(m.client_id) as client_id
      from triage_items t
      cross join lateral match_processes_by_cnj(t.organization_id, array[t.cnj]) m
     where t.process_id is null and t.cnj is not null and t.state in ('pendente', 'em_revisao')
     group by t.id
    having count(*) = 1
  )
  update triage_items t
     set process_id = c.process_id,
         client_id = (select cl.id from clients cl where cl.organization_id = t.organization_id and cl.id = c.client_id),
         link_method = 'cnj'
    from candidates c
   where t.id = c.id;
  get diagnostics total = row_count;
  return total;
end
$$;

revoke execute on function public.relink_triage_items() from public, anon, authenticated;
grant execute on function public.relink_triage_items() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Interpretação da IA (uma vez por evento) — só o servidor
-- ---------------------------------------------------------------------------

-- Eventos abertos ainda sem interpretação (ou com falha, até 3 tentativas), reservados
-- para que duas execuções não interpretem o mesmo evento.
create or replace function public.claim_triage_ai(p_limit integer, p_lease_seconds integer default 600)
returns table (
  item_id uuid, org_id uuid, item_kind text, item_title text, item_text text, item_event_date date,
  item_available_at date, item_tribunal text, item_classe text, item_suggestion jsonb, item_attempts integer
)
language sql
volatile
security definer
set search_path = public
as $$
  with c as (
    select t.id, t.intimacao_id
      from triage_items t
     where t.state in ('pendente', 'em_revisao')
       and (t.ai_status = 'pendente' or (t.ai_status = 'falhou' and t.ai_attempts < 3))
       and (t.ai_next_at is null or t.ai_next_at <= now())
     order by t.created_at
     limit greatest(0, least(p_limit, 50))
     for update of t skip locked
  )
  update triage_items t
     set ai_next_at = now() + make_interval(secs => greatest(60, p_lease_seconds))
    from c
    left join intimacoes i on i.id = c.intimacao_id
   where t.id = c.id
  returning t.id, t.organization_id, t.kind, t.title,
            case when t.kind = 'intimacao' then coalesce(i.content, t.excerpt, t.title) else concat_ws(' · ', t.title, t.excerpt) end,
            t.event_date,
            t.available_at, t.tribunal, i.classe, t.suggestion, t.ai_attempts
$$;

revoke execute on function public.claim_triage_ai(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_triage_ai(integer, integer) to service_role;

-- Resultado da interpretação. Dúvida da IA sobre um evento que estava "pendente" o
-- manda para revisão manual; nunca decide nada.
create or replace function public.save_triage_ai(
  p_id uuid, p_ai jsonb, p_ok boolean, p_review_reason text default null, p_retry_seconds integer default 3600
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
         ai_attempts = t.ai_attempts + 1,
         ai_next_at = case when p_ok then null else now() + make_interval(secs => greatest(60, p_retry_seconds)) end,
         state = case when p_ok and p_review_reason is not null and t.state = 'pendente' then 'em_revisao' else t.state end,
         review_reason = case
           when p_ok and p_review_reason is not null and t.state = 'pendente' then left(p_review_reason, 1000)
           else t.review_reason end
   where t.id = p_id and t.ai_status <> 'pronto'
$$;

revoke execute on function public.save_triage_ai(uuid, jsonb, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.save_triage_ai(uuid, jsonb, boolean, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Prazos da triagem
-- ---------------------------------------------------------------------------

alter table public.deadlines drop constraint if exists deadlines_origin;
alter table public.deadlines add constraint deadlines_origin check (data ->> 'origin' in ('manual', 'intimacao', 'movimentacao'));

-- No máximo um prazo por evento da triagem.
create unique index if not exists deadlines_triage_unique
  on public.deadlines (organization_id, (data ->> 'triageItemId'))
  where data ? 'triageItemId';

-- ---------------------------------------------------------------------------
-- 8. Tempo real: a triagem, não mais a intimação
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
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'triage_items'
  ) then
    alter publication supabase_realtime add table public.triage_items;
  end if;
  if exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intimacoes'
  ) then
    alter publication supabase_realtime drop table public.intimacoes;
  end if;
end
$$;

commit;

-- Conferência: eventos na triagem por estado.
select state as "estado", count(*) as "eventos" from public.triage_items group by state order by state;
