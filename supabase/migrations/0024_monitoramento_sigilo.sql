-- Íntegra — monitoramento automático não consulta processo em segredo de justiça.
--
-- Rode no SQL Editor do Supabase depois da 0023. Pode rodar de novo sem erro.
-- ADITIVA: só redefine `claim_process_monitoring` (0009) com o MESMO comportamento, mais
-- um filtro. Tabelas, dados e o estado de monitoramento já gravado não mudam.
--
-- Por quê: a seleção horária pegava todo processo acompanhado pelo DataJud, inclusive os
-- marcados como segredo de justiça no cadastro do escritório — e o servidor consultava a
-- fonte externa por eles a cada hora (a regra só era aplicada depois, ao gravar). A
-- consulta processual e a atualização pela tela já não consultam esses processos; agora o
-- monitoramento também não. O nível de sigilo do processo não é alterado.

begin;

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
      -- Segredo de justiça no cadastro: nenhuma consulta externa automática.
      and coalesce(p.data ->> 'secret', 'false') <> 'true'
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
