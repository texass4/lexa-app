-- Íntegra — monitoramento automático de processos (worker `/api/cron/process-sync`).
--
-- Rode no SQL Editor do Supabase depois da 0001, 0005 e 0006. Pode rodar de novo sem erro.
--
-- 1. `process_monitoring`: o estado do monitoramento de cada processo — última
--    consulta, resultado, erro e a PRÓXIMA consulta permitida (`next_check_at`).
--    É o que impede consultar a fonte sem necessidade: o worker só pega processos
--    com `next_check_at` vencido. Sai junto com o processo (FK em cascata).
--    A tela lê pelo próprio processo (`data.lastSyncedAt`/`data.autoSyncedAt`);
--    esta tabela é do servidor. Membros do escritório podem LER a do próprio
--    escritório (RLS); só o servidor (service role) grava.
--
-- 2. `process_sync_runs`: uma linha por execução do worker, com os números que o
--    Super Admin vê em Admin › Monitoramento. Sem acesso pelo navegador: só o
--    servidor (service role) lê e grava.
--
-- 3. `claim_process_monitoring`: seleciona os processos elegíveis e os reserva
--    para a execução numa única instrução (com as falhas seguidas de cada um, base
--    do backoff). Duas execuções simultâneas nunca pegam
--    o mesmo processo; se a execução cair, a reserva vence sozinha.
--
-- Elegível = escritório ativo + processo não concluído + acompanhado pela consulta
-- automática (`data.source.provider = 'datajud'`) + CNJ com 20 dígitos + próxima
-- consulta vencida (ou nunca consultado). Os mais antigos primeiro.

begin;

-- ---------------------------------------------------------------------------
-- 1. Estado do monitoramento por processo
-- ---------------------------------------------------------------------------

create table if not exists public.process_monitoring (
  organization_id uuid not null,
  process_id text not null,
  cnj text not null check (cnj ~ '^[0-9]{20}$'),
  -- Última tentativa (com ou sem sucesso).
  last_checked_at timestamptz,
  -- Quando a fonte foi conferida com sucesso (pode ser a data do cache reaproveitado).
  last_success_at timestamptz,
  last_result text check (last_result in ('updated', 'unchanged', 'not_found', 'unsupported', 'rate_limited', 'unavailable', 'conflict', 'error')),
  -- Código interno do erro (ex.: RATE_LIMIT). Nunca detalhe técnico nem resposta da fonte.
  last_error text,
  last_new_movements integer not null default 0,
  consecutive_failures integer not null default 0,
  -- Próxima consulta permitida. Durante uma execução, é a reserva (agora + alguns minutos).
  next_check_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, process_id),
  foreign key (organization_id, process_id) references public.processes (organization_id, id) on delete cascade
);

create index if not exists process_monitoring_next_check_idx on public.process_monitoring (next_check_at);

alter table public.process_monitoring enable row level security;
revoke all on public.process_monitoring from anon, authenticated;
grant select on public.process_monitoring to authenticated;

drop policy if exists process_monitoring_select on public.process_monitoring;
create policy process_monitoring_select on public.process_monitoring
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

-- ---------------------------------------------------------------------------
-- 2. Execuções do worker
-- ---------------------------------------------------------------------------

create table if not exists public.process_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null default 'cron',
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  -- Processos elegíveis reservados nesta execução.
  evaluated integer not null default 0,
  -- Idas reais à fonte (o que veio do cache não conta).
  queried integer not null default 0,
  from_cache integer not null default 0,
  updated_processes integer not null default 0,
  new_movements integer not null default 0,
  errors integer not null default 0,
  rate_limited integer not null default 0,
  unavailable integer not null default 0,
  -- Depois de 429 / fonte fora: as próximas execuções só consultam a partir daqui.
  resume_after timestamptz,
  note text
);

create index if not exists process_sync_runs_started_idx on public.process_sync_runs (started_at desc);

alter table public.process_sync_runs enable row level security;
revoke all on public.process_sync_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Seleção + reserva atômica
-- ---------------------------------------------------------------------------

create or replace function public.claim_process_monitoring(p_limit integer, p_lease_seconds integer default 900)
returns table (org_id uuid, proc_id text, cnj_digits text, failures integer)
language sql
volatile
security definer
set search_path = public
as $$
  with candidates as (
    select p.organization_id, p.id, c.cnj
    from processes p
    join organizations o on o.id = p.organization_id and o.status = 'active'
    cross join lateral (
      select coalesce(nullif(p.data ->> 'cnj', ''), regexp_replace(coalesce(p.data ->> 'number', ''), '\D', '', 'g')) as cnj
    ) c
    left join process_monitoring m on m.organization_id = p.organization_id and m.process_id = p.id
    where coalesce(p.data ->> 'status', '') <> 'concluido'
      and p.data -> 'source' ->> 'provider' = 'datajud'
      and c.cnj ~ '^[0-9]{20}$'
      and (m.next_check_at is null or m.next_check_at <= now())
    order by m.last_checked_at asc nulls first, p.created_at asc
    limit greatest(0, least(p_limit, 100))
  )
  insert into process_monitoring as m (organization_id, process_id, cnj, next_check_at)
  select organization_id, id, cnj, now() + make_interval(secs => greatest(60, p_lease_seconds))
  from candidates
  on conflict (organization_id, process_id) do update
    set next_check_at = excluded.next_check_at, cnj = excluded.cnj, updated_at = now()
    -- Reservado por outra execução no meio-tempo: fica com ela.
    where m.next_check_at is null or m.next_check_at <= now()
  returning m.organization_id, m.process_id, m.cnj, m.consecutive_failures
$$;

revoke execute on function public.claim_process_monitoring(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_process_monitoring(integer, integer) to service_role;

commit;

-- Conferência: processos acompanhados e quantos já têm estado de monitoramento.
select
  count(*) filter (where p.data -> 'source' ->> 'provider' = 'datajud' and coalesce(p.data ->> 'status', '') <> 'concluido') as "acompanhados",
  count(m.process_id) as "com estado de monitoramento"
from public.processes p
left join public.process_monitoring m on m.organization_id = p.organization_id and m.process_id = p.id;
