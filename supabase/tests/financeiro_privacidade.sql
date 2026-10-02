-- Íntegra — teste da RLS: nada do Financeiro chega a quem não tem `finance.view`.
--
-- Roda num banco com as migrações aplicadas (Supabase local ou de testes), como
-- superusuário: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/financeiro_privacidade.sql`.
-- Tudo acontece numa transação desfeita no fim (ROLLBACK): não deixa dado nenhum.
-- Falhou uma regra → o script para com "FALHOU: …".
--
-- Cobre: leitura direta das tabelas (o que a API REST e o Realtime entregam, ambos
-- pela RLS), escrita direta, atividades financeiras ("Atividade recente" e linhas do
-- tempo) e isolamento entre escritórios.

begin;

-- ------------------------------------------------------------------- cenário
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'colaborador@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'advogado@a.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'financeiro@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'socio@b.test');

insert into public.organizations (id, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'Escritório A', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'Escritório B', 'active');

insert into public.profiles (id, organization_id, role, permissions, name, email) values
  -- Sócia: tudo.
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner', null, 'Sócia', 'socia@a.test'),
  -- Colaborador com o padrão do papel: sem Financeiro.
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'staff', null, 'Colaborador', 'colaborador@a.test'),
  -- Advogado com o padrão do papel: vê o Financeiro, não edita.
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'lawyer', null, 'Advogado', 'advogado@a.test'),
  -- Colaborador com permissão personalizada de Financeiro.
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000a', 'staff',
   array['clients.view', 'finance.view', 'finance.edit'], 'Financeiro', 'financeiro@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner', null, 'Sócio B', 'socio@b.test');

insert into public.invoices (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'inv-a', '{"id":"inv-a","clientId":"c-1","description":"Honorários","amount":8500,"dueDate":"2026-09-13","status":"pendente"}'),
  ('00000000-0000-0000-0000-00000000000b', 'inv-b', '{"id":"inv-b","clientId":"c-9","description":"Honorários B","amount":1200,"dueDate":"2026-09-13","status":"pendente"}');

insert into public.activities (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'act-pay', '{"id":"act-pay","type":"payment","message":"registrou um pagamento recebido.","detail":"Honorários · R$ 8.500,00 · pago em 10/09/2026","clientId":"c-1"}'),
  ('00000000-0000-0000-0000-00000000000a', 'act-client', '{"id":"act-client","type":"client","message":"cadastrou um cliente.","clientId":"c-1"}'),
  ('00000000-0000-0000-0000-00000000000b', 'act-pay-b', '{"id":"act-pay-b","type":"payment","message":"registrou um pagamento recebido.","detail":"R$ 1.200,00"}');

-- Age como a pessoa logada (o mesmo que a API REST e o Realtime fazem com o JWT).
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

-- Tenta uma escrita; devolve true se o banco recusou.
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or check_violation then
  return true;
end $$;

-- ---------------------------------------------- com Financeiro: vê tudo do escritório
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from public.invoices) = 1, 'sócia vê os lançamentos do escritório');
select pg_temp.check((select count(*) from public.activities) = 2, 'sócia vê todas as atividades, inclusive as financeiras');
select pg_temp.check(not exists (select 1 from public.invoices where id = 'inv-b'), 'sócia não vê lançamentos de outro escritório');
select pg_temp.check(not exists (select 1 from public.activities where id = 'act-pay-b'), 'sócia não vê atividades de outro escritório');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check((select count(*) from public.invoices) = 1, 'advogado (finance.view) vê os lançamentos');
select pg_temp.check(exists (select 1 from public.activities where id = 'act-pay'), 'advogado (finance.view) vê a atividade de pagamento');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select pg_temp.check(exists (select 1 from public.activities where id = 'act-pay'), 'permissão personalizada de Financeiro vê a atividade de pagamento');
select pg_temp.check(not pg_temp.denied($q$insert into public.activities (organization_id, id, data) values ('00000000-0000-0000-0000-00000000000a', 'act-pay-2', '{"id":"act-pay-2","type":"payment","message":"lançou uma cobrança."}')$q$),
  'quem edita o Financeiro registra a atividade de pagamento');
reset role;

-- ---------------------------------------------- sem Financeiro: nada financeiro chega
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) from public.invoices) = 0, 'colaborador sem Financeiro não lê lançamentos');
select pg_temp.check(not exists (select 1 from public.invoices where id = 'inv-a'), 'colaborador sem Financeiro não lê lançamento pelo id');
select pg_temp.check(not exists (select 1 from public.activities where data ->> 'type' = 'payment'), 'colaborador sem Financeiro não lê atividades de pagamento');
select pg_temp.check(not exists (select 1 from public.activities where data::text like '%R$%'), 'nenhuma atividade com valor em reais chega ao colaborador');
select pg_temp.check(exists (select 1 from public.activities where id = 'act-client'), 'colaborador continua vendo as atividades que não são financeiras');
select pg_temp.check((select count(*) from public.activities where data ->> 'clientId' = 'c-1') = 1, 'linha do tempo do cliente sem o pagamento');

-- Escrita direta (o que um script pela API REST tentaria).
select pg_temp.check(pg_temp.denied($q$insert into public.invoices (organization_id, id, data) values ('00000000-0000-0000-0000-00000000000a', 'inv-x', '{"id":"inv-x","amount":1}')$q$),
  'colaborador sem Financeiro não cria lançamento');
update public.invoices set data = jsonb_set(data, '{amount}', '1') where id = 'inv-a';
delete from public.invoices where id = 'inv-a';
select pg_temp.check(pg_temp.denied($q$insert into public.activities (organization_id, id, data) values ('00000000-0000-0000-0000-00000000000a', 'act-fake', '{"id":"act-fake","type":"payment","message":"registrou um pagamento recebido.","detail":"R$ 1,00"}')$q$),
  'colaborador sem Financeiro não registra atividade de pagamento');
select pg_temp.check(not pg_temp.denied($q$insert into public.activities (organization_id, id, data) values ('00000000-0000-0000-0000-00000000000a', 'act-task', '{"id":"act-task","type":"task","message":"criou uma tarefa."}')$q$),
  'colaborador continua registrando atividades que não são financeiras');
reset role;

-- O update e o delete do colaborador não alcançaram a linha.
select pg_temp.check((select (data ->> 'amount')::numeric from public.invoices where id = 'inv-a') = 8500, 'colaborador sem Financeiro não altera nem exclui lançamento');

-- Nenhuma função que lê o Financeiro fica aberta a quem está logado.
select pg_temp.check(not exists (
  select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and (p.prosrc ilike '%invoices%' or p.prosrc ilike '%''payment''%')
     and has_function_privilege('authenticated', p.oid, 'execute')
), 'funções com privilégio elevado que leem o Financeiro não são executáveis por usuários logados');

select 'financeiro_privacidade: todas as regras passaram' as resultado;

rollback;
