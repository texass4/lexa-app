-- Íntegra — teste da Consulta processual (migração 0020): RLS, isolamento entre
-- escritórios, permissões, colunas internas e "uma execução em andamento por número".
--
-- Roda num banco com as migrações aplicadas, como superusuário:
-- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/consulta_processual.sql`.
-- Tudo numa transação desfeita no fim (ROLLBACK). Falhou uma regra → "FALHOU: …".

begin;

-- ------------------------------------------------------------------- cenário
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'semprocesso@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'socio@b.test');

insert into public.organizations (id, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'Escritório A', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'Escritório B', 'active');

insert into public.profiles (id, organization_id, role, permissions, name, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner', null, 'Sócia', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'staff', array['clients.view'], 'Sem processos', 'semprocesso@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner', null, 'Sócio B', 'socio@b.test');

insert into public.processes (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'proc-a', '{"id":"proc-a","code":"#1","number":"0000832-35.2018.4.01.3202"}');

-- Gravação pelo servidor (service role = superusuário aqui).
insert into public.process_enrichment_runs (id, organization_id, process_id, cnj, requested_by, status, report, internal_errors) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-00000000000a', 'proc-a', '00008323520184013202',
   '00000000-0000-0000-0000-0000000000a1', 'completed', '{"number":"0000832-35.2018.4.01.3202"}', '[{"source":"datajud","code":"RATE_LIMIT","detail":"HTTP 429"}]'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-00000000000b', null, '00008323520184013202',
   '00000000-0000-0000-0000-0000000000b1', 'completed', '{"number":"0000832-35.2018.4.01.3202"}', '[]');

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.check(p_ok boolean, p_rule text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_rule; end if;
end $$;

-- Executa um comando que DEVE ser recusado (permissão, RLS ou chave).
create function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or check_violation or foreign_key_violation or unique_violation then
  return true;
end $$;

select pg_temp.check(not pg_temp.refused('select 1'), 'controle do teste: comando permitido não é recusa');

-- ----------------------------------------------------------------- servidor
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_enrichment_runs (organization_id, cnj, status) values ('00000000-0000-0000-0000-00000000000a', '00008323520184013202', 'running'), ('00000000-0000-0000-0000-00000000000a', '00008323520184013202', 'running')$q$),
  'uma só execução em andamento por escritório + número'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_enrichment_runs (organization_id, cnj) values ('00000000-0000-0000-0000-00000000000a', '123')$q$),
  'número precisa ter 20 dígitos'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_enrichment_runs (organization_id, cnj, status) values ('00000000-0000-0000-0000-00000000000a', '00008323520184013202', 'inventado')$q$),
  'estado fora da lista é recusado'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_enrichment_runs (organization_id, process_id, cnj, status) values ('00000000-0000-0000-0000-00000000000b', 'proc-a', '00008323520184013202', 'completed')$q$),
  'execução de B não aponta para processo de A'
);

-- -------------------------------------------------------------------- anônimo
set local role anon;
select pg_temp.check(pg_temp.refused('select id from public.process_enrichment_runs'), 'anônimo não lê consultas');
reset role;

-- ------------------------------------------------------- sócia do escritório A
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check(
  (select count(*) = 1 and min(id::text) = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' from public.process_enrichment_runs),
  'A vê só as consultas do próprio escritório'
);
select pg_temp.check((select report ->> 'number' = '0000832-35.2018.4.01.3202' from public.process_enrichment_runs), 'A lê o relatório');
select pg_temp.check(pg_temp.refused('select internal_errors from public.process_enrichment_runs'), 'erros técnicos internos não são legíveis pela API');
select pg_temp.check(pg_temp.refused('select * from public.process_enrichment_runs'), 'select * também não expõe a coluna interna');
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_enrichment_runs (organization_id, cnj, status) values ('00000000-0000-0000-0000-00000000000a', '00008323520184013202', 'completed')$q$),
  'ninguém cria execução pela API (só o servidor)'
);
select pg_temp.check(pg_temp.refused($q$update public.process_enrichment_runs set status = 'failed'$q$), 'ninguém altera o registro pela API');
select pg_temp.check(pg_temp.refused($q$delete from public.process_enrichment_runs$q$), 'ninguém apaga o registro pela API');
reset role;

-- --------------------------------------------------- membro sem processos.view
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check((select count(*) = 0 from public.process_enrichment_runs), 'sem processes.view não vê consultas');
reset role;

-- ------------------------------------------------------------- escritório B
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(
  (select count(*) = 1 and min(id::text) = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' from public.process_enrichment_runs),
  'B não vê as consultas de A (mesmo número)'
);
reset role;

-- Excluir o processo mantém o histórico da consulta, sem o vínculo.
delete from public.processes where id = 'proc-a';
select pg_temp.check(
  (select process_id is null from public.process_enrichment_runs where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'processo excluído: a consulta fica, sem o vínculo'
);

select 'consulta processual: OK' as resultado;
rollback;
