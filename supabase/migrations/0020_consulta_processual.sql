-- Íntegra — Consulta processual: registro de cada execução do workflow
-- "Consultar processo" (fontes consultadas, estado de cada etapa, campos encontrados
-- e o relatório normalizado).
--
-- Rode no SQL Editor do Supabase depois da 0019. Pode rodar de novo sem erro.
-- Documentação: docs/CONSULTA_PROCESSUAL.md.
--
-- Regras:
-- 1. Uma linha por execução, sempre de UM escritório (`organization_id`).
-- 2. Membros do escritório com `processes.view` LEEM as execuções do próprio escritório
--    (RLS). Ninguém grava pela API: só o servidor (service role), depois de conferir
--    quem pediu. Assim o registro (fontes, horários, resultado) não é editável à mão.
-- 3. `internal_errors` (detalhe técnico das falhas) não é legível por `authenticated`:
--    a coluna fica fora do GRANT. A tela recebe só estado + mensagem pública.
-- 4. Sem cópia integral das fontes: `report` guarda os campos já normalizados (sem o
--    JSON bruto) e trechos curtos das comunicações, com o link oficial. O servidor
--    mantém só as 10 execuções mais recentes de cada processo por escritório.
-- 5. Uma execução em andamento por escritório + número (índice único parcial):
--    pedidos repetidos reaproveitam a que está rodando.

begin;

create table if not exists public.process_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Processo cadastrado consultado (ausente quando a consulta partiu só do número).
  process_id text,
  -- 20 dígitos do CNJ.
  cnj text not null,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'running',
  -- O usuário pediu para ignorar o cache recente ("Consultar novamente").
  forced boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  -- Etapas: [{ id, label, status, detail, finishedAt }]
  steps jsonb not null default '[]'::jsonb,
  -- Fontes: [{ id, name, role, status, startedAt, finishedAt, durationMs, cached, checkedAt, dataVersion, fields, message, url }]
  sources jsonb not null default '[]'::jsonb,
  -- Relatório normalizado (ver lib/services/consulta/types.ts). Nulo enquanto roda.
  report jsonb,
  found_fields text[] not null default '{}',
  missing_fields text[] not null default '{}',
  -- Versão/data dos dados da fonte principal (última atualização informada por ela).
  data_version text,
  -- Só servidor: [{ source, code, detail }].
  internal_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint process_enrichment_runs_status check (status in ('running', 'completed', 'partial', 'failed')),
  constraint process_enrichment_runs_cnj check (cnj ~ '^[0-9]{20}$'),
  -- Processo excluído: a execução fica (histórico), sem o vínculo.
  constraint process_enrichment_runs_process_fk foreign key (organization_id, process_id)
    references public.processes (organization_id, id) on delete set null (process_id)
);

create index if not exists process_enrichment_runs_lookup_idx
  on public.process_enrichment_runs (organization_id, cnj, started_at desc);
create index if not exists process_enrichment_runs_process_idx
  on public.process_enrichment_runs (organization_id, process_id, started_at desc);
create unique index if not exists process_enrichment_runs_one_running
  on public.process_enrichment_runs (organization_id, cnj) where status = 'running';

drop trigger if exists process_enrichment_runs_touch on public.process_enrichment_runs;
create trigger process_enrichment_runs_touch before update on public.process_enrichment_runs
  for each row execute function public.touch_updated_at();

alter table public.process_enrichment_runs enable row level security;
revoke all on public.process_enrichment_runs from public, anon, authenticated;
-- Leitura sem `internal_errors`.
grant select (
  id, organization_id, process_id, cnj, requested_by, status, forced, started_at, finished_at, duration_ms,
  steps, sources, report, found_fields, missing_fields, data_version, created_at, updated_at
) on public.process_enrichment_runs to authenticated;
grant all on public.process_enrichment_runs to service_role;

drop policy if exists process_enrichment_runs_select on public.process_enrichment_runs;
create policy process_enrichment_runs_select on public.process_enrichment_runs
  for select to authenticated
  using (organization_id = public.current_org_id() and public.has_perm('processes.view'));

commit;

-- Conferência: a tabela existe, com RLS, e `internal_errors` não é legível pela API.
select
  c.relrowsecurity as "rls ligada",
  has_column_privilege('authenticated', 'public.process_enrichment_runs', 'report', 'select') as "relatório legível",
  has_column_privilege('authenticated', 'public.process_enrichment_runs', 'internal_errors', 'select') as "erros internos legíveis (deve ser false)",
  has_table_privilege('authenticated', 'public.process_enrichment_runs', 'insert') as "insert pela API (deve ser false)"
from pg_class c
where c.oid = 'public.process_enrichment_runs'::regclass;
