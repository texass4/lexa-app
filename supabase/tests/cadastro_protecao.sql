-- Íntegra — teste da migração 0015 (cadastro protegido).
--
-- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cadastro_protecao.sql`
-- num banco com as migrações aplicadas, como superusuário. Tudo numa transação
-- desfeita no fim (ROLLBACK). Falhou uma regra → para com "FALHOU: …".

begin;

create function pg_temp.check(p_ok boolean, p_rule text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_rule; end if;
end $$;

-- ------------------------------------------------------------ limite no banco
select pg_temp.check(public.auth_rate_hit('teste:a', 3, 3600), '1ª tentativa dentro do limite');
select pg_temp.check(public.auth_rate_hit('teste:a', 3, 3600), '2ª tentativa dentro do limite');
select pg_temp.check(public.auth_rate_hit('teste:a', 3, 3600), '3ª tentativa dentro do limite');
select pg_temp.check(not public.auth_rate_hit('teste:a', 3, 3600), '4ª tentativa bloqueada');
select pg_temp.check(public.auth_rate_hit('teste:b', 3, 3600), 'outra chave não é afetada');
update public.auth_rate_limits set window_start = now() - interval '2 hours' where key = 'teste:a';
select pg_temp.check(public.auth_rate_hit('teste:a', 3, 3600), 'janela vencida libera de novo');
select pg_temp.check((select hits from public.auth_rate_limits where key = 'teste:a') = 1, 'nova janela recomeça a contagem');
-- Uso único (desafio anti-bot): limite 1.
select pg_temp.check(public.auth_rate_hit('desafio:x', 1, 7200), 'desafio usado uma vez');
select pg_temp.check(not public.auth_rate_hit('desafio:x', 1, 7200), 'desafio reaproveitado é recusado');

-- ------------------------------------------------ situação do e-mail no Auth
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000c001', 'pendente@teste.local', null),
  ('00000000-0000-0000-0000-00000000c002', 'confirmado@teste.local', now());

select pg_temp.check(not exists (select 1 from public.auth_email_status('ninguem@teste.local')), 'e-mail sem conta');
select pg_temp.check((select not confirmed from public.auth_email_status('PENDENTE@teste.local')), 'pendente, sem diferenciar maiúsculas');
select pg_temp.check((select confirmed and not has_profile from public.auth_email_status('confirmado@teste.local')), 'confirmado, ainda sem escritório');

-- ------------------------------------- escritório só depois da confirmação
create temp table before_orgs as select count(*) as n from public.organizations;

do $$
begin
  perform public.provision_signup('00000000-0000-0000-0000-00000000c001', 'pendente@teste.local', 'Pendente', 'Escritório P', '', 'Essencial', 'pending');
  raise exception 'FALHOU: escritório criado para e-mail não confirmado';
exception when check_violation then null;
end $$;

create temp table provisioned as
  select public.provision_signup('00000000-0000-0000-0000-00000000c002', 'confirmado@teste.local', 'Confirmada', 'Escritório C', '12.345.678/0001-90', 'Essencial', 'pending') as org;
select pg_temp.check((select org from provisioned) is not null, 'confirmado: escritório criado');
select pg_temp.check(
  public.provision_signup('00000000-0000-0000-0000-00000000c002', 'confirmado@teste.local', 'Confirmada', 'Escritório C', '', 'Essencial', 'pending') = (select org from provisioned),
  'segundo clique no link não cria outro escritório');
select pg_temp.check((select count(*) from public.organizations) = (select n from before_orgs) + 1, 'exatamente um escritório novo');
select pg_temp.check(
  exists (select 1 from public.profiles p join public.organizations o on o.id = p.organization_id
           where p.id = '00000000-0000-0000-0000-00000000c002' and p.role = 'owner' and o.status = 'pending' and o.name = 'Escritório C'),
  'perfil de Sócio no escritório aguardando aprovação');
select pg_temp.check((select has_profile from public.auth_email_status('confirmado@teste.local')), 'agora com escritório');

-- -------------------------------------- nada disso fica aberto pela API pública
select pg_temp.check(not has_function_privilege('anon', 'public.auth_rate_hit(text, integer, integer)', 'execute'), 'anon não conta tentativas');
select pg_temp.check(not has_function_privilege('authenticated', 'public.auth_rate_hit(text, integer, integer)', 'execute'), 'logado não conta tentativas');
select pg_temp.check(not has_function_privilege('anon', 'public.auth_email_status(text)', 'execute'), 'anon não consulta e-mails (enumeração)');
select pg_temp.check(not has_function_privilege('authenticated', 'public.auth_email_status(text)', 'execute'), 'logado não consulta e-mails (enumeração)');
select pg_temp.check(not has_function_privilege('anon', 'public.provision_signup(uuid, text, text, text, text, text, text)', 'execute'), 'anon não cria escritório');
select pg_temp.check(not has_function_privilege('authenticated', 'public.provision_signup(uuid, text, text, text, text, text, text)', 'execute'), 'logado não cria escritório');
select pg_temp.check(not has_table_privilege('authenticated', 'public.auth_rate_limits', 'select'), 'logado não lê os limites');
select pg_temp.check(not has_table_privilege('anon', 'public.auth_rate_limits', 'select'), 'anon não lê os limites');

select 'cadastro_protecao: todas as regras passaram' as resultado;

rollback;
