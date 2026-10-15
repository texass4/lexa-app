-- Íntegra — teste da RLS das Páginas (migração 0027).
--
-- Roda num banco com as migrações aplicadas, como superusuário:
-- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/paginas.sql`.
-- Tudo numa transação desfeita no fim (ROLLBACK). Falhou uma regra → "FALHOU: …".
--
-- Cobre: página pessoal × do escritório, leitor (só `tasks.view`), isolamento entre
-- escritórios, vínculo com cliente/processo, subpáginas (herança, ciclo, mistura),
-- campos definidos pelo servidor (autor, versão, tarefas referenciadas, busca) e favoritos.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'advogado@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'leitor@a.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'sem-clientes@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'socio@b.test');

insert into public.organizations (id, name, status) values
  ('00000000-0000-0000-0000-00000000000a', 'Escritório A', 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'Escritório B', 'active');

insert into public.profiles (id, organization_id, role, permissions, name, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner', null, 'Sócia', 'socia@a.test'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'lawyer', null, 'Advogado', 'advogado@a.test'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'staff',
   array['clients.view', 'processes.view', 'tasks.view'], 'Leitor', 'leitor@a.test'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000a', 'staff',
   array['tasks.view', 'tasks.edit'], 'Sem clientes', 'sem-clientes@a.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner', null, 'Sócio B', 'socio@b.test');

insert into public.clients (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'c-1', '{"id":"c-1","name":"Cliente Um"}');
insert into public.processes (organization_id, id, data) values
  ('00000000-0000-0000-0000-00000000000a', 'p-1', '{"id":"p-1","title":"Processo Um"}');

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

-- Tenta uma escrita; true se o banco recusou (RLS, regra do gatilho ou chave).
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or check_violation or foreign_key_violation then
  return true;
end $$;

-- Quantas linhas uma escrita afetou (RLS que filtra não dá erro: afeta 0).
create function pg_temp.affected(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return 0;
end $$;

-- ------------------------------------------------------------- a sócia cria
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.pages (organization_id, id, title, visibility, content) values
  ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000001', 'Notas pessoais', 'private',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Lembrete de reunião"}]}]}'),
  ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000002', 'Planejamento da semana', 'office',
   '{"type":"doc","content":[{"type":"taskRef","attrs":{"taskId":"t_1"}},{"type":"taskRef","attrs":{"taskId":"t_2"}},{"type":"taskRef","attrs":{"taskId":"t_1"}}]}'),
  ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000003', 'Análise do caso', 'office', '{"type":"doc","content":[]}');
update public.pages set client_id = 'c-1' where id = 'pg_00000000-0000-0000-0000-000000000003';

select pg_temp.check((select created_by from public.pages where id = 'pg_00000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-0000000000a1', 'autor vem do login');
select pg_temp.check((select task_ids from public.pages where id = 'pg_00000000-0000-0000-0000-000000000002') = array['t_1', 't_2'], 'tarefas referenciadas extraídas do conteúdo, sem repetição');
select pg_temp.check((select search like '%lembrete de reuniao%' from public.pages where id = 'pg_00000000-0000-0000-0000-000000000001'), 'busca sem acento inclui o texto do conteúdo');
select pg_temp.check((select version from public.pages where id = 'pg_00000000-0000-0000-0000-000000000003') = 1, 'mudar o vínculo não muda a versão do texto');
update public.pages set title = 'Análise do caso (rev.)' where id = 'pg_00000000-0000-0000-0000-000000000003';
select pg_temp.check((select version from public.pages where id = 'pg_00000000-0000-0000-0000-000000000003') = 2, 'versão sobe quando o texto muda');
select pg_temp.check(pg_temp.denied($$insert into public.pages (organization_id, id, title, created_by) values ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000009', 'x', '00000000-0000-0000-0000-0000000000a2')$$),
  'autor não é gravável pelo navegador');
select pg_temp.check(pg_temp.denied($$update public.pages set version = 99 where id = 'pg_00000000-0000-0000-0000-000000000001'$$), 'versão não é gravável pelo navegador');
select pg_temp.check(pg_temp.denied($$insert into public.pages (organization_id, id, title) values ('00000000-0000-0000-0000-00000000000b', 'pg_00000000-0000-0000-0000-000000000008', 'intrusa')$$),
  'não cria página em outro escritório');

-- Subpáginas
insert into public.pages (organization_id, id, parent_id, title, visibility) values
  ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000011', 'pg_00000000-0000-0000-0000-000000000001', 'Sub pessoal', 'office'),
  ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000021', 'pg_00000000-0000-0000-0000-000000000002', 'Sub do escritório', 'private');
select pg_temp.check((select visibility from public.pages where id = 'pg_00000000-0000-0000-0000-000000000011') = 'private', 'subpágina herda "pessoal"');
select pg_temp.check((select visibility from public.pages where id = 'pg_00000000-0000-0000-0000-000000000021') = 'office', 'subpágina herda "escritório"');
select pg_temp.check(pg_temp.denied($$update public.pages set parent_id = 'pg_00000000-0000-0000-0000-000000000021' where id = 'pg_00000000-0000-0000-0000-000000000002'$$),
  'página não vai para dentro da própria subpágina (ciclo)');
reset role;

-- ------------------------------------------------- advogado (tasks.edit)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check(not exists (select 1 from public.pages where id = 'pg_00000000-0000-0000-0000-000000000001'), 'página pessoal não aparece para outra pessoa');
select pg_temp.check(not exists (select 1 from public.pages where id = 'pg_00000000-0000-0000-0000-000000000011'), 'subpágina pessoal não aparece para outra pessoa');
select pg_temp.check(exists (select 1 from public.pages where id = 'pg_00000000-0000-0000-0000-000000000002'), 'página do escritório aparece para a equipe');
select pg_temp.check(pg_temp.affected($$update public.pages set title = 'invadida' where id = 'pg_00000000-0000-0000-0000-000000000001'$$) = 0, 'não edita página pessoal de outra pessoa');
select pg_temp.check(pg_temp.affected($$delete from public.pages where id = 'pg_00000000-0000-0000-0000-000000000001'$$) = 0, 'não exclui página pessoal de outra pessoa');
select pg_temp.check(pg_temp.affected($$update public.pages set title = 'Planejamento (revisto)' where id = 'pg_00000000-0000-0000-0000-000000000002'$$) = 1, 'edita página do escritório com tasks.edit');
select pg_temp.check(pg_temp.denied($$update public.pages set visibility = 'private' where id = 'pg_00000000-0000-0000-0000-000000000002'$$), 'só quem criou muda o acesso da página');
select pg_temp.check(pg_temp.denied($$insert into public.pages (organization_id, id, parent_id, title) values ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000031', 'pg_00000000-0000-0000-0000-000000000001', 'x')$$),
  'não cria subpágina dentro de página pessoal alheia');
insert into public.pages (organization_id, id, parent_id, title) values
  ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000022', 'pg_00000000-0000-0000-0000-000000000002', 'Sub do advogado');
select pg_temp.check(pg_temp.denied($$insert into public.page_favorites (organization_id, user_id, page_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'pg_00000000-0000-0000-0000-000000000001')$$),
  'não favorita página que não vê');
insert into public.page_favorites (organization_id, user_id, page_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'pg_00000000-0000-0000-0000-000000000002');
reset role;

-- A sócia não pode tornar pessoal uma árvore com subpágina de outra pessoa.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check(pg_temp.denied($$update public.pages set visibility = 'private' where id = 'pg_00000000-0000-0000-0000-000000000002'$$), 'árvore com páginas de outras pessoas não vira pessoal');
select pg_temp.check((select count(*) from public.page_favorites) = 0, 'favoritos de outra pessoa não aparecem');
reset role;

-- --------------------------------------------------- leitor (tasks.view)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check(exists (select 1 from public.pages where id = 'pg_00000000-0000-0000-0000-000000000002'), 'leitor lê página do escritório');
select pg_temp.check(pg_temp.affected($$update public.pages set title = 'x' where id = 'pg_00000000-0000-0000-0000-000000000002'$$) = 0, 'leitor não edita página do escritório');
select pg_temp.check(pg_temp.affected($$delete from public.pages where id = 'pg_00000000-0000-0000-0000-000000000002'$$) = 0, 'leitor não exclui página do escritório');
select pg_temp.check(pg_temp.denied($$insert into public.pages (organization_id, id, title, visibility) values ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000041', 'x', 'office')$$),
  'leitor não cria página do escritório');
insert into public.pages (organization_id, id, title) values
  ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000042', 'Minhas anotações');
select pg_temp.check(pg_temp.affected($$update public.pages set title = 'Minhas anotações (2)' where id = 'pg_00000000-0000-0000-0000-000000000042'$$) = 1, 'leitor edita a própria página pessoal');
reset role;

-- ------------------------------- sem clients.view: página vinculada some
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select pg_temp.check(not exists (select 1 from public.pages where id = 'pg_00000000-0000-0000-0000-000000000003'), 'página vinculada a cliente some para quem não vê clientes');
select pg_temp.check(exists (select 1 from public.pages where id = 'pg_00000000-0000-0000-0000-000000000002'), 'página sem vínculo continua visível');
select pg_temp.check(pg_temp.denied($$insert into public.pages (organization_id, id, title, process_id) values ('00000000-0000-0000-0000-00000000000a', 'pg_00000000-0000-0000-0000-000000000051', 'x', 'p-1')$$),
  'não vincula página a processo que não vê');
reset role;

-- -------------------------------------------------------- outro escritório
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from public.pages) = 0, 'outro escritório não vê nenhuma página');
select pg_temp.check(pg_temp.affected($$update public.pages set title = 'x' where id = 'pg_00000000-0000-0000-0000-000000000002'$$) = 0, 'outro escritório não edita');
select pg_temp.check(pg_temp.affected($$delete from public.pages where id = 'pg_00000000-0000-0000-0000-000000000002'$$) = 0, 'outro escritório não exclui');
select pg_temp.check(pg_temp.denied($$insert into public.page_favorites (organization_id, user_id, page_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'pg_00000000-0000-0000-0000-000000000002')$$),
  'outro escritório não favorita');
reset role;

-- --------------------------------------- exclusão leva as subpáginas junto
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
delete from public.pages where id = 'pg_00000000-0000-0000-0000-000000000002';
reset role;
select pg_temp.check(not exists (select 1 from public.pages where parent_id = 'pg_00000000-0000-0000-0000-000000000002'), 'subpáginas saem com a página');
select pg_temp.check(not exists (select 1 from public.page_favorites where page_id = 'pg_00000000-0000-0000-0000-000000000002'), 'favoritos saem com a página');

select 'paginas: todas as regras passaram' as resultado;

rollback;
