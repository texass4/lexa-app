-- Íntegra — teste da migração 0026 (favoritos de documentos).
--
-- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/documentos_favoritos.sql`
-- num banco com as migrações aplicadas, como superusuário. Tudo numa transação
-- desfeita no fim (ROLLBACK). Falhou uma regra → para com "FALHOU: …".
--
-- Cobre: cada pessoa só vê e mexe nos próprios favoritos; nada atravessa escritórios;
-- sem `documents.view` não há favoritos; documento inexistente é recusado; excluído o
-- documento, o favorito sai junto.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f00a1', 'socia@fav-a.test'),
  ('00000000-0000-0000-0000-0000000f00a2', 'advogado@fav-a.test'),
  ('00000000-0000-0000-0000-0000000f00a3', 'semdocs@fav-a.test'),
  ('00000000-0000-0000-0000-0000000f00b1', 'socio@fav-b.test');

insert into public.organizations (id, name, status) values
  ('00000000-0000-0000-0000-0000000f000a', 'Escritório Fav A', 'active'),
  ('00000000-0000-0000-0000-0000000f000b', 'Escritório Fav B', 'active');

insert into public.profiles (id, organization_id, role, permissions, name, email) values
  ('00000000-0000-0000-0000-0000000f00a1', '00000000-0000-0000-0000-0000000f000a', 'owner', null, 'Sócia', 'socia@fav-a.test'),
  ('00000000-0000-0000-0000-0000000f00a2', '00000000-0000-0000-0000-0000000f000a', 'lawyer', null, 'Advogado', 'advogado@fav-a.test'),
  ('00000000-0000-0000-0000-0000000f00a3', '00000000-0000-0000-0000-0000000f000a', 'staff', array['clients.view'], 'Sem documentos', 'semdocs@fav-a.test'),
  ('00000000-0000-0000-0000-0000000f00b1', '00000000-0000-0000-0000-0000000f000b', 'owner', null, 'Sócio B', 'socio@fav-b.test');

insert into public.documents (organization_id, id, data) values
  ('00000000-0000-0000-0000-0000000f000a', 'doc-a1', '{"id":"doc-a1","name":"Contrato.pdf","kind":"Contrato","extension":"pdf","sizeBytes":10}'),
  ('00000000-0000-0000-0000-0000000f000a', 'doc-a2', '{"id":"doc-a2","name":"Laudo.pdf","kind":"Laudo","extension":"pdf","sizeBytes":10}'),
  ('00000000-0000-0000-0000-0000000f000b', 'doc-b1', '{"id":"doc-b1","name":"Outro.pdf","kind":"Laudo","extension":"pdf","sizeBytes":10}');

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

create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or check_violation or foreign_key_violation then
  return true;
end $$;

-- ---------------------------------------------------------- favoritos próprios
select pg_temp.as_user('00000000-0000-0000-0000-0000000f00a1');
insert into public.document_favorites (organization_id, user_id, document_id)
  values ('00000000-0000-0000-0000-0000000f000a', '00000000-0000-0000-0000-0000000f00a1', 'doc-a1');
select pg_temp.check((select count(*) from public.document_favorites) = 1, 'sócia marca e vê o próprio favorito');
select pg_temp.check(pg_temp.denied($$insert into public.document_favorites (organization_id, user_id, document_id)
  values ('00000000-0000-0000-0000-0000000f000a', '00000000-0000-0000-0000-0000000f00a2', 'doc-a2')$$), 'não marca favorito em nome de outra pessoa');
select pg_temp.check(pg_temp.denied($$insert into public.document_favorites (organization_id, user_id, document_id)
  values ('00000000-0000-0000-0000-0000000f000b', '00000000-0000-0000-0000-0000000f00a1', 'doc-b1')$$), 'não marca documento de outro escritório');
select pg_temp.check(pg_temp.denied($$insert into public.document_favorites (organization_id, user_id, document_id)
  values ('00000000-0000-0000-0000-0000000f000a', '00000000-0000-0000-0000-0000000f00a1', 'nao-existe')$$), 'documento inexistente é recusado');
select pg_temp.check(pg_temp.denied($$update public.document_favorites set document_id = 'doc-a2'$$), 'favorito não é editável');
reset role;

-- --------------------------------------------- outra pessoa do mesmo escritório
select pg_temp.as_user('00000000-0000-0000-0000-0000000f00a2');
select pg_temp.check((select count(*) from public.document_favorites) = 0, 'advogado não vê os favoritos da sócia');
delete from public.document_favorites;
reset role;
select pg_temp.check((select count(*) from public.document_favorites) = 1, 'advogado não apaga os favoritos da sócia');

-- --------------------------------------------------------- sem documents.view
select pg_temp.as_user('00000000-0000-0000-0000-0000000f00a3');
select pg_temp.check(pg_temp.denied($$insert into public.document_favorites (organization_id, user_id, document_id)
  values ('00000000-0000-0000-0000-0000000f000a', '00000000-0000-0000-0000-0000000f00a3', 'doc-a1')$$), 'sem permissão de documentos não há favoritos');
reset role;

-- ------------------------------------------------------------ outro escritório
select pg_temp.as_user('00000000-0000-0000-0000-0000000f00b1');
select pg_temp.check((select count(*) from public.document_favorites) = 0, 'outro escritório não vê nada');
reset role;

-- ----------------------------------------------- documento excluído leva junto
delete from public.documents where organization_id = '00000000-0000-0000-0000-0000000f000a' and id = 'doc-a1';
select pg_temp.check((select count(*) from public.document_favorites) = 0, 'excluído o documento, o favorito sai junto');

rollback;
