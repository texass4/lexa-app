-- Íntegra — Abertura leve: carga inicial mínima e o resto sob demanda.
--
-- Rode no SQL Editor do Supabase depois da 0015. Pode rodar de novo sem erro.
--
-- 1. `processes_summary`: os processos sem o histórico de movimentações (fica só a
--    mais recente, sem o objeto bruto da fonte). É o que listas, Painel e sinais usam;
--    o histórico completo é lido da tabela quando a pessoa abre o processo. A visão
--    usa `security_invoker`: valem as mesmas políticas (RLS) da tabela `processes`.
-- 2. Proteção do histórico: um processo gravado a partir do resumo leva a marca
--    `movementsPartial`. O banco então mantém as movimentações que já tem e só junta
--    as novas (por id) — gravar o resumo nunca apaga histórico. A marca não é salva.
-- 3. Índices para as leituras filtradas (por processo, cliente, situação e data).

begin;

-- ------------------------------------------------------------ 1. resumo
create or replace view public.processes_summary
with (security_invoker = true) as
select
  p.organization_id,
  p.id,
  p.created_at,
  p.updated_at,
  (p.data - 'movements')
    || jsonb_build_object(
      'movements',
      coalesce(
        (select jsonb_agg(m.value - 'raw')
           from (select value from jsonb_array_elements(coalesce(p.data -> 'movements', '[]'::jsonb))
                  order by value ->> 'at' desc
                  limit 1) m),
        '[]'::jsonb
      ),
      'movementsPartial', true
    ) as data
from public.processes p;

revoke all on public.processes_summary from public, anon;
grant select on public.processes_summary to authenticated, service_role;

-- --------------------------------------------- 2. histórico nunca se perde
create or replace function public.processes_keep_movements()
returns trigger
language plpgsql
as $$
declare
  v_partial boolean;
  v_new jsonb;
begin
  if not (new.data ? 'movementsPartial') then
    return new;
  end if;
  v_partial := coalesce((new.data ->> 'movementsPartial')::boolean, false);
  new.data := new.data - 'movementsPartial';
  if tg_op = 'UPDATE' and v_partial then
    -- Só as movimentações que o banco ainda não tem (ex.: trazidas por uma consulta).
    select coalesce(jsonb_agg(m.value), '[]'::jsonb)
      into v_new
      from jsonb_array_elements(coalesce(new.data -> 'movements', '[]'::jsonb)) m
     where not exists (
       select 1 from jsonb_array_elements(coalesce(old.data -> 'movements', '[]'::jsonb)) o
        where o.value ->> 'id' = m.value ->> 'id'
     );
    new.data := jsonb_set(new.data, '{movements}', v_new || coalesce(old.data -> 'movements', '[]'::jsonb));
  end if;
  return new;
end
$$;

drop trigger if exists processes_keep_movements on public.processes;
create trigger processes_keep_movements
  before insert or update on public.processes
  for each row execute function public.processes_keep_movements();

-- ------------------------------------------------------------- 3. índices
create index if not exists activities_org_process_idx on public.activities (organization_id, (data ->> 'processId'));
create index if not exists activities_org_client_idx on public.activities (organization_id, (data ->> 'clientId'));
create index if not exists documents_org_process_idx on public.documents (organization_id, (data ->> 'processId'));
create index if not exists documents_org_client_idx on public.documents (organization_id, (data ->> 'clientId'));
create index if not exists documents_org_uploaded_idx on public.documents (organization_id, (data ->> 'uploadedAt'));
create index if not exists tasks_org_related_idx on public.tasks (organization_id, (data -> 'related' ->> 'id'));
create index if not exists tasks_org_status_idx on public.tasks (organization_id, (data ->> 'status'));
create index if not exists invoices_org_client_idx on public.invoices (organization_id, (data ->> 'clientId'));
create index if not exists invoices_org_status_idx on public.invoices (organization_id, (data ->> 'status'));
create index if not exists appointments_org_start_idx on public.appointments (organization_id, (data ->> 'start'));
create index if not exists appointments_org_client_idx on public.appointments (organization_id, (data ->> 'clientId'));
create index if not exists appointments_org_process_idx on public.appointments (organization_id, (data ->> 'processId'));
create index if not exists deadlines_org_client_idx on public.deadlines (organization_id, client_id);
create index if not exists deadlines_org_status_idx on public.deadlines (organization_id, (data ->> 'status'));
create index if not exists notifications_org_read_idx on public.notifications (organization_id, (data ->> 'read'));

commit;
