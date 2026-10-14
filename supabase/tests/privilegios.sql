-- Íntegra — teste dos privilégios mínimos (migração 0023).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/privilegios.sql
-- Só lê o catálogo do banco; nada é gravado. Falhou uma regra → "FALHOU: …".

begin;

create function pg_temp.check(p_ok boolean, p_rule text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_rule; end if;
end $$;

select pg_temp.check(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as r(role)
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (has_table_privilege(r.role, c.oid, 'truncate')
        or has_table_privilege(r.role, c.oid, 'trigger')
        or has_table_privilege(r.role, c.oid, 'references'))
  ),
  'anon/authenticated sem TRUNCATE, TRIGGER e REFERENCES em public (a RLS não vale para TRUNCATE)'
);

select pg_temp.check(
  has_table_privilege('authenticated', 'public.processes_summary', 'select')
  and not has_table_privilege('authenticated', 'public.processes_summary', 'insert')
  and not has_table_privilege('authenticated', 'public.processes_summary', 'update')
  and not has_table_privilege('authenticated', 'public.processes_summary', 'delete'),
  'processes_summary: só leitura para authenticated'
);

-- O que a aplicação usa continua concedido (a RLS decide linha a linha).
select pg_temp.check(
  has_table_privilege('authenticated', 'public.processes', 'select')
  and has_table_privilege('authenticated', 'public.processes', 'insert')
  and has_table_privilege('authenticated', 'public.processes', 'update')
  and has_table_privilege('authenticated', 'public.processes', 'delete'),
  'processes: leitura e escrita continuam para authenticated (com RLS)'
);
select pg_temp.check(has_table_privilege('service_role', 'public.processes', 'truncate'), 'service_role não é afetado');

select pg_temp.check(
  (select allowed_mime_types @> array['application/pdf', 'text/plain'] and not ('text/html' = any(allowed_mime_types)) from storage.buckets where id = 'documents'),
  'documents: só os formatos oferecidos na tela'
);
select pg_temp.check(
  (select allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] from storage.buckets where id = 'avatars'),
  'avatars (público): só imagens PNG, JPG e WEBP'
);

select 'privilegios: OK' as resultado;
rollback;
