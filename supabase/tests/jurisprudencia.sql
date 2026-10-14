-- Íntegra — teste da jurisprudência (migração 0019): RLS, isolamento entre escritórios,
-- permissões, deduplicação e busca.
--
-- Roda num banco com as migrações aplicadas (Supabase local ou de testes), como
-- superusuário: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/jurisprudencia.sql`.
-- Tudo numa transação desfeita no fim (ROLLBACK). Falhou uma regra → "FALHOU: …".
-- As decisões abaixo são DADO DE TESTE (texto fictício), só existem dentro da transação.

begin;

-- ------------------------------------------------------------------- cenário
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'colaborador@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'semprocesso@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'socio@b.test');

insert into public.organizations (id, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'Escritório A', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'Escritório B', 'active');

insert into public.profiles (id, organization_id, role, permissions, name, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner', null, 'Sócia', 'socia@a.test'),
  -- Colaborador com o padrão do papel: vê e edita processos.
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'staff', null, 'Colaborador', 'colaborador@a.test'),
  -- Sem acesso a processos.
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'staff', array['clients.view'], 'Sem processos', 'semprocesso@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner', null, 'Sócio B', 'socio@b.test');

insert into public.processes (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'proc-a', '{"id":"proc-a","code":"#1","number":"0001"}'),
  ('00000000-0000-0000-0000-00000000000b', 'proc-b', '{"id":"proc-b","code":"#2","number":"0002"}');

-- Base só com as decisões deste teste (a transação é desfeita no fim: nada se perde).
delete from public.jurisprudence;
delete from public.jurisprudence_sync_runs;

insert into public.jurisprudence (id, provider, tribunal, external_id, class_code, court, judgment_date, subject, ementa, area, degree, content_hash) values
  ('11111111-1111-4111-8111-111111111111', 'stj', 'STJ', 'T-1', 'REsp', 'TERCEIRA TURMA', '2025-09-16', 'CONSUMIDOR. NEGATIVAÇÃO INDEVIDA',
   'CONSUMIDOR. NEGATIVAÇÃO INDEVIDA. Inscrição sem prévia notificação do devedor gera indenização (texto de teste).', 'Direito Privado', 'Superior', 'h1'),
  ('22222222-2222-4222-8222-222222222222', 'stj', 'STJ', 'T-2', 'HC', 'SEXTA TURMA', '2025-08-01', 'PENAL. HABEAS CORPUS',
   'PENAL. HABEAS CORPUS. Prisão preventiva sem fundamentação concreta (texto de teste).', 'Direito Penal', 'Superior', 'h2'),
  ('33333333-3333-4333-8333-333333333333', 'stj', 'STJ', 'T-3', 'AgInt', 'QUARTA TURMA', '2025-07-01', 'CONSUMIDOR. CADASTRO',
   'CONSUMIDOR. Cadastro de inadimplentes. Notificação enviada (texto de teste).', 'Direito Privado', 'Superior', 'h3');

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
  -- Só recusa de verdade (permissão/RLS, regra, chave). Erro de digitação no teste quebra o teste.
  return true;
end $$;

-- Controle: um comando permitido NÃO conta como recusado.
select pg_temp.check(not pg_temp.refused('select 1'), 'controle do teste: comando permitido não é recusa');

-- ------------------------------------------------------- deduplicação (banco)
select pg_temp.check(
  pg_temp.refused($q$insert into public.jurisprudence (provider, tribunal, external_id, ementa, content_hash) values ('stj', 'STJ', 'T-1', 'x', 'h')$q$),
  'a mesma decisão (provider + tribunal + external_id) não entra duas vezes'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.jurisprudence (provider, tribunal, external_id, ementa, content_hash, source_url) values ('stj', 'STJ', 'T-9', 'x', 'h', 'javascript:alert(1)')$q$),
  'link da fonte só https'
);

-- -------------------------------------------------------------------- anônimo
set local role anon;
select pg_temp.check(pg_temp.refused('select count(*) from public.jurisprudence'), 'anônimo não lê a base');
select pg_temp.check(pg_temp.refused($q$select * from public.search_jurisprudence('consumidor')$q$), 'anônimo não pesquisa');
reset role;

-- ------------------------------------------------------- sócia do escritório A
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) = 3 from public.jurisprudence), 'membro com processos.view lê a base pública');
select pg_temp.check(pg_temp.refused($q$update public.jurisprudence set ementa = 'adulterada'$q$), 'ninguém altera a base pela API');
select pg_temp.check(pg_temp.refused($q$delete from public.jurisprudence$q$), 'ninguém apaga a base pela API');
select pg_temp.check(pg_temp.refused($q$insert into public.jurisprudence (provider, tribunal, external_id, ementa, content_hash) values ('stj', 'STJ', 'falsa', 'falsa', 'h')$q$), 'ninguém insere decisão pela API');
select pg_temp.check(pg_temp.refused('select count(*) from public.jurisprudence_sync_runs'), 'log da sincronização é só do servidor');

-- Busca: linguagem natural, sem acento, ranking, filtros, paginação.
select pg_temp.check(
  (select id = '11111111-1111-4111-8111-111111111111' from public.search_jurisprudence('indenizacao por negativacao indevida sem previa notificacao') limit 1),
  'linguagem natural sem acento encontra a decisão certa primeiro'
);
select pg_temp.check(
  (select count(*) = 2 and min(total) = 2 from public.search_jurisprudence('notificação')),
  'busca por termo traz todas as decisões com o termo e o total'
);
select pg_temp.check(
  (select count(*) = 1 from public.search_jurisprudence('notificação', '{"court":"QUARTA TURMA"}')),
  'filtro por órgão julgador'
);
select pg_temp.check(
  (select count(*) = 1 from public.search_jurisprudence('', '{"area":"Direito Penal"}')),
  'filtro por área sem termos'
);
select pg_temp.check(
  (select count(*) = 2 from public.search_jurisprudence('', '{"from":"2025-08-01","to":"2025-12-31"}')),
  'filtro por período'
);
select pg_temp.check(
  (select count(*) = 1 and min(total) = 3 from public.search_jurisprudence('', '{}', 'recent', 1, 1)),
  'paginação: uma por página, total de 3'
);
select pg_temp.check(
  (select id = '11111111-1111-4111-8111-111111111111' from public.search_jurisprudence('', '{}', 'recent') limit 1),
  'mais recentes primeiro'
);
select pg_temp.check(
  (select count(*) = 0 from public.search_jurisprudence('de para com')),
  'só palavras vazias: nenhum resultado (nada aleatório)'
);
select pg_temp.check(
  (select position('⟦' in snippet) > 0 from public.search_jurisprudence('negativação') limit 1),
  'trecho destaca os termos encontrados'
);

-- Salvar e vincular.
insert into public.saved_jurisprudence (organization_id, jurisprudence_id, created_by, notes)
values ('00000000-0000-0000-0000-00000000000a', '11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'usar na réplica');
select pg_temp.check(
  pg_temp.refused($q$insert into public.saved_jurisprudence (organization_id, jurisprudence_id, created_by) values ('00000000-0000-0000-0000-00000000000a', '11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-0000000000a1')$q$),
  'a mesma decisão é salva uma vez por escritório'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.saved_jurisprudence (organization_id, jurisprudence_id, created_by) values ('00000000-0000-0000-0000-00000000000b', '22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-0000000000a1')$q$),
  'não salva em nome de outro escritório'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.saved_jurisprudence (organization_id, jurisprudence_id, created_by) values ('00000000-0000-0000-0000-00000000000a', '22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-0000000000a2')$q$),
  'não salva em nome de outra pessoa'
);
insert into public.process_jurisprudence (organization_id, process_id, jurisprudence_id, created_by)
values ('00000000-0000-0000-0000-00000000000a', 'proc-a', '11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-0000000000a1');
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_jurisprudence (organization_id, process_id, jurisprudence_id, created_by) values ('00000000-0000-0000-0000-00000000000a', 'proc-b', '11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-0000000000a1')$q$),
  'não vincula processo de outro escritório (chave composta)'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_jurisprudence (organization_id, process_id, jurisprudence_id, created_by) values ('00000000-0000-0000-0000-00000000000b', 'proc-b', '11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-0000000000a1')$q$),
  'não vincula em nome de outro escritório'
);
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_jurisprudence (organization_id, process_id, jurisprudence_id, created_by) values ('00000000-0000-0000-0000-00000000000a', 'proc-a', '99999999-9999-4999-8999-999999999999', '00000000-0000-0000-0000-0000000000a1')$q$),
  'não vincula decisão inexistente'
);
select pg_temp.check((select count(*) = 1 from public.jurisprudence_status() where provider = 'stj' and decisions = 3), 'situação da base para a tela');
reset role;

-- ------------------------------------------------- colaborador do escritório A
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) = 1 from public.saved_jurisprudence), 'equipe do escritório vê as salvas do escritório');
select pg_temp.check((select count(*) = 1 from public.process_jurisprudence), 'equipe do escritório vê os vínculos');
reset role;

-- ------------------------------------------ pessoa sem acesso a processos (A)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check((select count(*) = 0 from public.jurisprudence), 'sem processes.view não lê a base');
select pg_temp.check((select count(*) = 0 from public.saved_jurisprudence), 'sem processes.view não vê as salvas');
select pg_temp.check(
  pg_temp.refused($q$insert into public.process_jurisprudence (organization_id, process_id, jurisprudence_id, created_by) values ('00000000-0000-0000-0000-00000000000a', 'proc-a', '22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-0000000000a3')$q$),
  'sem processes.edit não vincula'
);
reset role;

-- ----------------------------------------------------------- escritório B
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) = 3 from public.jurisprudence), 'a base pública é a mesma para todos (sem cópia por escritório)');
select pg_temp.check((select count(*) = 0 from public.saved_jurisprudence), 'B não vê as salvas de A');
select pg_temp.check((select count(*) = 0 from public.process_jurisprudence), 'B não vê os vínculos de A');
delete from public.saved_jurisprudence;
delete from public.process_jurisprudence;
update public.saved_jurisprudence set notes = 'invadido';
reset role;

select pg_temp.check(
  (select count(*) = 1 and min(notes) = 'usar na réplica' from public.saved_jurisprudence where organization_id = '00000000-0000-0000-0000-00000000000a'),
  'B não apaga nem altera as salvas de A'
);
select pg_temp.check((select count(*) = 1 from public.process_jurisprudence), 'B não apaga os vínculos de A');

-- Excluir o processo desfaz o vínculo; a decisão continua na base.
delete from public.processes where id = 'proc-a';
select pg_temp.check((select count(*) = 0 from public.process_jurisprudence), 'vínculo sai com o processo');
select pg_temp.check((select count(*) = 3 from public.jurisprudence), 'a decisão continua na base');

select 'jurisprudencia: OK' as resultado;
rollback;
