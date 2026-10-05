-- Íntegra — teste dos avisos de exclusão do tempo real (migração 0018).
--
-- Roda num banco com as migrações aplicadas (Supabase local ou de testes), como
-- superusuário: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/realtime_exclusoes.sql`.
-- Tudo acontece numa transação desfeita no fim (ROLLBACK): não deixa dado nenhum.
-- Falhou uma regra → o script para com "FALHOU: …".
--
-- Cobre: a publicação não envia DELETE (o Realtime não aplica RLS a exclusões);
-- toda exclusão gera um aviso; o aviso só é visível (e, pelo Realtime, entregue) a
-- quem é do mesmo escritório e pode ver a coleção; ninguém grava avisos direto.

begin;

-- ------------------------------------------------------------------- cenário
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'colaborador@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'socio@b.test');

insert into public.organizations (id, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'Escritório A', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'Escritório B', 'active');

insert into public.profiles (id, organization_id, role, permissions, name, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner', null, 'Sócia', 'socia@a.test'),
  -- Colaborador com o padrão do papel: sem Financeiro.
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'staff', null, 'Colaborador', 'colaborador@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner', null, 'Sócio B', 'socio@b.test');

insert into public.clients (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'cli-a', '{"id":"cli-a","name":"Cliente A","kind":"PF","document":"529.982.247-25","status":"ativo"}'),
  ('00000000-0000-0000-0000-00000000000b', 'cli-b', '{"id":"cli-b","name":"Cliente B","kind":"PF","document":"","status":"contato"}');
insert into public.invoices (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'inv-a', '{"id":"inv-a","clientId":"cli-a","description":"Honorários","amount":8500,"dueDate":"2026-09-13","status":"pendente"}');
insert into public.activities (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'act-a', '{"id":"act-a","type":"task","message":"concluiu uma tarefa."}'),
  ('00000000-0000-0000-0000-00000000000a', 'act-pay-a', '{"id":"act-pay-a","type":"payment","message":"registrou um pagamento recebido.","detail":"R$ 8.500,00"}');

-- Aviso antigo (3 dias): sai na próxima exclusão.
insert into public.realtime_deletions (organization_id, collection, record_id, deleted_at)
values ('00000000-0000-0000-0000-00000000000a', 'clients', 'antigo', now() - interval '3 days');

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

create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(collection || ':' || record_id, ',' order by collection, record_id), '') from public.realtime_deletions
$$;

-- ---------------------------------------------------------------- publicação
select pg_temp.check(
  (select not pubdelete and not pubtruncate and pubinsert and pubupdate from pg_publication where pubname = 'supabase_realtime'),
  'a publicação do Realtime não envia DELETE/TRUNCATE (exclusões não passam pela RLS)'
) where exists (select 1 from pg_publication where pubname = 'supabase_realtime');
select pg_temp.check(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'realtime_deletions'),
  'os avisos de exclusão estão na publicação do Realtime'
) where exists (select 1 from pg_publication where pubname = 'supabase_realtime');

-- ----------------------------------------------------------------- exclusões
delete from public.clients where id in ('cli-a', 'cli-b');
delete from public.invoices where id = 'inv-a';
delete from public.activities where id in ('act-a', 'act-pay-a');

select pg_temp.check(
  (select count(*) = 5 from public.realtime_deletions
    where organization_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  'cada exclusão gera um aviso (e o aviso antigo foi apagado)'
);
select pg_temp.check(not exists (select 1 from public.realtime_deletions where record_id = 'antigo'), 'avisos com mais de 2 dias são apagados');

-- Sócia de A: tudo de A, nada de B.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check(pg_temp.seen() = 'activities:act-a,activities:act-pay-a,clients:cli-a,invoices:inv-a', 'sócia vê os avisos do próprio escritório: ' || pg_temp.seen());
reset role;

-- Colaborador de A sem Financeiro: nem o lançamento nem a atividade financeira.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check(pg_temp.seen() = 'activities:act-a,clients:cli-a', 'colaborador sem Financeiro não fica sabendo de exclusões financeiras: ' || pg_temp.seen());
select pg_temp.check(
  (select count(*) = 0 from (select 1 from public.realtime_deletions where collection = 'invoices') x),
  'colaborador sem Financeiro não vê avisos de lançamentos'
);
reset role;

-- Sócio de B: só o de B.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(pg_temp.seen() = 'clients:cli-b', 'outro escritório só vê os próprios avisos: ' || pg_temp.seen());
-- Ninguém grava aviso direto (só o gatilho, com privilégio próprio).
select pg_temp.check(
  (select not has_table_privilege('authenticated', 'public.realtime_deletions', 'INSERT')),
  'usuários logados não gravam avisos de exclusão'
);
reset role;

select pg_temp.check(not has_table_privilege('anon', 'public.realtime_deletions', 'SELECT'), 'anônimo não lê avisos de exclusão');

select 'realtime_exclusoes: todas as regras passaram' as resultado;

rollback;
